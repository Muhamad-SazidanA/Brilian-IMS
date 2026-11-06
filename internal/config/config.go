package config

import (
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all centralized runtime configuration for BrilianIDMS.
type Config struct {
	ServerPort     string   // e.g. "8080"
	GinMode        string   // "debug", "release", or "test"
	DatabaseURL    string   // PostgreSQL connection string
	MinioEndpoint  string   // e.g. "localhost:9000"
	MinioAccessKey string   // MinIO user
	MinioSecretKey string   // MinIO secret key
	MinioBucket    string   // MinIO bucket name
	MinioUseSSL    bool     // Use TLS/SSL for MinIO
	EncryptionKey  [32]byte // 32-byte AES-256 key decoded from 64-char hex
	AIProvider     string   // e.g. "vertex_ai"
	AIAPIKey       string   // API key / token
	AIModelName    string   // e.g. "gemini-1.5-flash"
	AIRegion       string   // e.g. "us-central1"
	LicensePath    string   // Path to license.lic
}

// LoadConfig loads environment variables, applies sensible defaults, and validates all parameters.
func LoadConfig() (*Config, error) {
	// Attempt loading .env file if it exists, but do not fail if absent (e.g. production container)
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		// Only ignore if it is file-not-found; other IO/parse errors may indicate malformed file
		if !strings.Contains(err.Error(), "no such file or directory") {
			return nil, fmt.Errorf("failed to load .env file: %w", err)
		}
	}

	cfg := &Config{
		ServerPort:     getEnv("SERVER_PORT", "8080"),
		GinMode:        getEnv("GIN_MODE", "release"),
		MinioEndpoint:  getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinioAccessKey: getEnv("MINIO_ACCESS_KEY", "minio_admin"),
		MinioSecretKey: getEnv("MINIO_SECRET_KEY", "minio_secret_password"),
		MinioBucket:    getEnv("MINIO_BUCKET_NAME", "brilian-documents"),
		AIProvider:     getEnv("AI_PROVIDER", "vertex_ai"),
		AIAPIKey:       getEnv("AI_API_KEY", ""),
		AIModelName:    getEnv("AI_MODEL_NAME", "gemini-1.5-flash"),
		AIRegion:       getEnv("AI_REGION", "us-central1"),
		LicensePath:    getEnv("LICENSE_FILE_PATH", "./license.lic"),
	}

	// 1. MinIO SSL parsing
	useSSLStr := getEnv("MINIO_USE_SSL", "false")
	useSSL, err := strconv.ParseBool(useSSLStr)
	if err != nil {
		return nil, fmt.Errorf("invalid MINIO_USE_SSL boolean value %q: %w", useSSLStr, err)
	}
	cfg.MinioUseSSL = useSSL

	// 2. Server Port validation
	portClean := strings.TrimPrefix(cfg.ServerPort, ":")
	portNum, err := strconv.Atoi(portClean)
	if err != nil || portNum < 1 || portNum > 65535 {
		return nil, fmt.Errorf("invalid SERVER_PORT %q: must be integer between 1 and 65535", cfg.ServerPort)
	}
	cfg.ServerPort = portClean

	// 3. Database URL resolution & validation
	dbURL := os.Getenv("DATABASE_URL")
	if strings.TrimSpace(dbURL) == "" {
		host := getEnv("DB_HOST", "localhost")
		port := getEnv("DB_PORT", "5432")
		user := getEnv("DB_USER", "brilian_user")
		pass := getEnv("DB_PASSWORD", "secure_password_here")
		name := getEnv("DB_NAME", "brilian_db")
		ssl := getEnv("DB_SSLMODE", "disable")

		dbURL = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
			url.QueryEscape(user),
			url.QueryEscape(pass),
			host,
			port,
			name,
			ssl,
		)
	}

	parsedURL, err := url.Parse(dbURL)
	if err != nil {
		return nil, fmt.Errorf("invalid database connection URL: %w", err)
	}
	if parsedURL.Scheme != "postgres" && parsedURL.Scheme != "postgresql" {
		return nil, fmt.Errorf("invalid database URL scheme %q: expected 'postgres' or 'postgresql'", parsedURL.Scheme)
	}
	if parsedURL.Host == "" {
		return nil, errors.New("invalid database URL: host is required")
	}
	if parsedURL.User != nil {
		if pass, ok := parsedURL.User.Password(); ok && strings.Contains(pass, ":") {
			return nil, errors.New("invalid database connection URL: malformed user credentials")
		}
	}
	cfg.DatabaseURL = dbURL

	// 4. MinIO Bucket validation
	if strings.TrimSpace(cfg.MinioBucket) == "" {
		return nil, errors.New("invalid MINIO_BUCKET_NAME: bucket name cannot be empty")
	}

	// 5. ENCRYPTION_KEY validation & decoding (32-byte AES-256)
	keyHex := strings.TrimSpace(os.Getenv("ENCRYPTION_KEY"))
	if keyHex == "" {
		return nil, errors.New("missing ENCRYPTION_KEY: must provide 64-character hex string (32 bytes)")
	}

	if len(keyHex) != 64 {
		return nil, fmt.Errorf("invalid ENCRYPTION_KEY length: expected 64 hex characters (32 bytes), got %d characters", len(keyHex))
	}

	decodedKey, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid ENCRYPTION_KEY: failed to hex decode: %w", err)
	}

	if len(decodedKey) != 32 {
		return nil, fmt.Errorf("invalid ENCRYPTION_KEY decoded size: expected 32 bytes, got %d", len(decodedKey))
	}

	copy(cfg.EncryptionKey[:], decodedKey)

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if val, ok := os.LookupEnv(key); ok {
		return strings.TrimSpace(val)
	}
	return defaultValue
}
