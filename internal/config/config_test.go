package config

import (
	"encoding/hex"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	validTestKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
)

func setStandardTestEnv(t *testing.T) {
	t.Helper()
	t.Setenv("ENCRYPTION_KEY", validTestKeyHex)
	t.Setenv("SERVER_PORT", "8080")
	t.Setenv("GIN_MODE", "test")
	t.Setenv("DB_HOST", "localhost")
	t.Setenv("DB_PORT", "5432")
	t.Setenv("DB_USER", "brilian_user")
	t.Setenv("DB_PASSWORD", "secret")
	t.Setenv("DB_NAME", "brilian_test")
	t.Setenv("DB_SSLMODE", "disable")
	t.Setenv("MINIO_ENDPOINT", "localhost:9000")
	t.Setenv("MINIO_ACCESS_KEY", "minioadmin")
	t.Setenv("MINIO_SECRET_KEY", "miniopass")
	t.Setenv("MINIO_BUCKET_NAME", "test-bucket")
	t.Setenv("MINIO_USE_SSL", "false")
	t.Setenv("AI_PROVIDER", "vertex_ai")
	t.Setenv("AI_API_KEY", "test-api-key")
	t.Setenv("AI_MODEL_NAME", "gemini-1.5-flash")
	t.Setenv("AI_REGION", "us-central1")
	t.Setenv("LICENSE_FILE_PATH", "./test.lic")
}

func TestLoadConfig_Success_SynthesizedDB(t *testing.T) {
	setStandardTestEnv(t)

	cfg, err := LoadConfig()
	require.NoError(t, err)
	require.NotNil(t, cfg)

	assert.Equal(t, "8080", cfg.ServerPort)
	assert.Equal(t, "test", cfg.GinMode)
	assert.Equal(t, "postgres://brilian_user:secret@localhost:5432/brilian_test?sslmode=disable", cfg.DatabaseURL)
	assert.Equal(t, "localhost:9000", cfg.MinioEndpoint)
	assert.Equal(t, "minioadmin", cfg.MinioAccessKey)
	assert.Equal(t, "miniopass", cfg.MinioSecretKey)
	assert.Equal(t, "test-bucket", cfg.MinioBucket)
	assert.False(t, cfg.MinioUseSSL)
	assert.Equal(t, "vertex_ai", cfg.AIProvider)
	assert.Equal(t, "test-api-key", cfg.AIAPIKey)
	assert.Equal(t, "gemini-1.5-flash", cfg.AIModelName)
	assert.Equal(t, "us-central1", cfg.AIRegion)
	assert.Equal(t, "./test.lic", cfg.LicensePath)

	expectedBytes, err := hex.DecodeString(validTestKeyHex)
	require.NoError(t, err)
	assert.Equal(t, expectedBytes, cfg.EncryptionKey[:])
}

func TestLoadConfig_Success_ExplicitDatabaseURL(t *testing.T) {
	setStandardTestEnv(t)
	explicitURL := "postgresql://custom_user:pass123@db.example.com:5433/prod_db?sslmode=require"
	t.Setenv("DATABASE_URL", explicitURL)

	cfg, err := LoadConfig()
	require.NoError(t, err)
	require.NotNil(t, cfg)
	assert.Equal(t, explicitURL, cfg.DatabaseURL)
}

func TestLoadConfig_InvalidServerPort(t *testing.T) {
	tests := []struct {
		name string
		port string
	}{
		{"Not a number", "abc"},
		{"Too large", "70000"},
		{"Negative/Zero", "0"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setStandardTestEnv(t)
			t.Setenv("SERVER_PORT", tt.port)

			cfg, err := LoadConfig()
			assert.Error(t, err)
			assert.Nil(t, cfg)
			assert.Contains(t, err.Error(), "invalid SERVER_PORT")
		})
	}
}

func TestLoadConfig_EncryptionKeyValidation(t *testing.T) {
	tests := []struct {
		name        string
		key         string
		errContains string
	}{
		{
			name:        "Empty key",
			key:         "",
			errContains: "missing ENCRYPTION_KEY",
		},
		{
			name:        "Too short (less than 64 hex chars)",
			key:         "abcdef123456",
			errContains: "invalid ENCRYPTION_KEY length",
		},
		{
			name:        "Too long (more than 64 hex chars)",
			key:         strings.Repeat("a", 66),
			errContains: "invalid ENCRYPTION_KEY length",
		},
		{
			name:        "Invalid hex characters (64 chars with non-hex 'zz')",
			key:         "zz" + strings.Repeat("a", 62),
			errContains: "failed to hex decode",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setStandardTestEnv(t)
			t.Setenv("ENCRYPTION_KEY", tt.key)

			cfg, err := LoadConfig()
			assert.Error(t, err)
			assert.Nil(t, cfg)
			assert.Contains(t, err.Error(), tt.errContains)
		})
	}
}

func TestLoadConfig_DatabaseURL_Validation(t *testing.T) {
	tests := []struct {
		name        string
		url         string
		errContains string
	}{
		{
			name:        "Invalid scheme (http instead of postgres)",
			url:         "http://localhost:5432/brilian_db",
			errContains: "invalid database URL scheme",
		},
		{
			name:        "Missing host",
			url:         "postgres:///brilian_db",
			errContains: "host is required",
		},
		{
			name:        "Malformed URL",
			url:         "postgres://user:pass:extra@localhost:5432/db",
			errContains: "invalid database connection URL",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setStandardTestEnv(t)
			t.Setenv("DATABASE_URL", tt.url)

			cfg, err := LoadConfig()
			require.Error(t, err)
			assert.Nil(t, cfg)
			assert.Contains(t, err.Error(), tt.errContains)
		})
	}
}

func TestLoadConfig_MinioSSL_Parsing(t *testing.T) {
	setStandardTestEnv(t)
	t.Setenv("MINIO_USE_SSL", "true")

	cfg, err := LoadConfig()
	require.NoError(t, err)
	assert.True(t, cfg.MinioUseSSL)

	t.Setenv("MINIO_USE_SSL", "invalid_bool")
	cfgFail, errFail := LoadConfig()
	assert.Error(t, errFail)
	assert.Nil(t, cfgFail)
	assert.Contains(t, errFail.Error(), "invalid MINIO_USE_SSL boolean value")
}

func TestLoadConfig_EmptyBucket(t *testing.T) {
	setStandardTestEnv(t)
	t.Setenv("MINIO_BUCKET_NAME", "")

	cfg, err := LoadConfig()
	require.Error(t, err)
	assert.Nil(t, cfg)
	assert.Contains(t, err.Error(), "MINIO_BUCKET_NAME: bucket name cannot be empty")
}
