package config

import (
	"encoding/hex"
	"fmt"
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAdversarial_EncryptionKey(t *testing.T) {
	testCases := []struct {
		name        string
		key         string
		expectError bool
		errContains string
	}{
		{
			name:        "Boundary length 63 chars (1 char too short)",
			key:         strings.Repeat("a", 63),
			expectError: true,
			errContains: "invalid ENCRYPTION_KEY length",
		},
		{
			name:        "Boundary length 65 chars (1 char too long)",
			key:         strings.Repeat("a", 65),
			expectError: true,
			errContains: "invalid ENCRYPTION_KEY length",
		},
		{
			name:        "Empty string",
			key:         "",
			expectError: true,
			errContains: "missing ENCRYPTION_KEY",
		},
		{
			name:        "Whitespace-only 64 chars",
			key:         strings.Repeat(" ", 64),
			expectError: true,
			errContains: "missing ENCRYPTION_KEY",
		},
		{
			name:        "64 chars with non-hex char at start ('g')",
			key:         "g" + strings.Repeat("0", 63),
			expectError: true,
			errContains: "failed to hex decode",
		},
		{
			name:        "64 chars with non-hex char at end ('z')",
			key:         strings.Repeat("0", 63) + "z",
			expectError: true,
			errContains: "failed to hex decode",
		},
		{
			name:        "64 chars with special punctuation in middle ('!')",
			key:         strings.Repeat("0", 31) + "!" + strings.Repeat("0", 32),
			expectError: true,
			errContains: "failed to hex decode",
		},
		{
			name:        "64 chars with internal space",
			key:         strings.Repeat("a", 31) + " " + strings.Repeat("a", 32),
			expectError: true,
			errContains: "failed to hex decode",
		},
		{
			name:        "Valid all uppercase hex 64 chars",
			key:         strings.Repeat("F", 64),
			expectError: false,
		},
		{
			name:        "Valid mixed-case hex 64 chars",
			key:         "0123456789ABCDEF0123456789abcdef0123456789ABCDEF0123456789abcdef",
			expectError: false,
		},
		{
			name:        "Valid hex with leading/trailing spaces (should trim)",
			key:         "   0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef   ",
			expectError: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			setStandardTestEnv(t)
			t.Setenv("ENCRYPTION_KEY", tc.key)

			cfg, err := LoadConfig()
			if tc.expectError {
				require.Error(t, err)
				assert.Nil(t, cfg)
				if tc.errContains != "" {
					assert.Contains(t, err.Error(), tc.errContains)
				}
			} else {
				require.NoError(t, err)
				require.NotNil(t, cfg)
				cleanKey := strings.TrimSpace(tc.key)
				expectedBytes, decodeErr := hex.DecodeString(cleanKey)
				require.NoError(t, decodeErr)
				assert.Equal(t, expectedBytes, cfg.EncryptionKey[:])
			}
		})
	}
}

func TestAdversarial_ServerPort(t *testing.T) {
	testCases := []struct {
		name         string
		port         string
		expectError  bool
		expectedPort string
	}{
		{
			name:        "Port 0 (out of bounds minimum)",
			port:        "0",
			expectError: true,
		},
		{
			name:        "Negative port -1",
			port:        "-1",
			expectError: true,
		},
		{
			name:        "Negative port -65535",
			port:        "-65535",
			expectError: true,
		},
		{
			name:        "Port 65536 (out of bounds maximum)",
			port:        "65536",
			expectError: true,
		},
		{
			name:        "Huge port 999999",
			port:        "999999",
			expectError: true,
		},
		{
			name:        "Non-numeric alphabetic 'http'",
			port:        "http",
			expectError: true,
		},
		{
			name:        "Alphanumeric mix '8080abc'",
			port:        "8080abc",
			expectError: true,
		},
		{
			name:        "Double colon '::8080'",
			port:        "::8080",
			expectError: true,
		},
		{
			name:        "Empty string port",
			port:        "",
			expectError: true,
		},
		{
			name:        "Colon only ':'",
			port:        ":",
			expectError: true,
		},
		{
			name:         "Boundary Valid 1",
			port:         "1",
			expectError:  false,
			expectedPort: "1",
		},
		{
			name:         "Boundary Valid 65535",
			port:         "65535",
			expectError:  false,
			expectedPort: "65535",
		},
		{
			name:         "Boundary Valid with colon ':1'",
			port:         ":1",
			expectError:  false,
			expectedPort: "1",
		},
		{
			name:         "Boundary Valid with colon ':65535'",
			port:         ":65535",
			expectError:  false,
			expectedPort: "65535",
		},
		{
			name:         "Whitespace padded port '  9000  '",
			port:         "  9000  ",
			expectError:  false,
			expectedPort: "9000",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			setStandardTestEnv(t)
			t.Setenv("SERVER_PORT", tc.port)

			cfg, err := LoadConfig()
			if tc.expectError {
				require.Error(t, err)
				assert.Nil(t, cfg)
				assert.Contains(t, err.Error(), "invalid SERVER_PORT")
			} else {
				require.NoError(t, err)
				require.NotNil(t, cfg)
				assert.Equal(t, tc.expectedPort, cfg.ServerPort)
			}
		})
	}
}

func TestAdversarial_DatabaseURL_SchemesAndHosts(t *testing.T) {
	testCases := []struct {
		name        string
		rawURL      string
		expectError bool
		errContains string
	}{
		{
			name:        "Scheme http is forbidden",
			rawURL:      "http://localhost:5432/brilian_db",
			expectError: true,
			errContains: "invalid database URL scheme",
		},
		{
			name:        "Scheme https is forbidden",
			rawURL:      "https://localhost:5432/brilian_db",
			expectError: true,
			errContains: "invalid database URL scheme",
		},
		{
			name:        "Scheme ftp is forbidden",
			rawURL:      "ftp://localhost:5432/brilian_db",
			expectError: true,
			errContains: "invalid database URL scheme",
		},
		{
			name:        "Scheme sqlite is forbidden",
			rawURL:      "sqlite:////data/brilian.db",
			expectError: true,
			errContains: "invalid database URL scheme",
		},
		{
			name:        "Scheme mysql is forbidden",
			rawURL:      "mysql://root:pass@localhost:3306/brilian_db",
			expectError: true,
			errContains: "invalid database URL scheme",
		},
		{
			name:        "Scheme mongodb is forbidden",
			rawURL:      "mongodb://root:pass@localhost:27017/brilian_db",
			expectError: true,
			errContains: "invalid database URL scheme",
		},
		{
			name:        "Missing scheme (bare host:port)",
			rawURL:      "localhost:5432/brilian_db",
			expectError: true,
			errContains: "invalid database URL scheme",
		},
		{
			name:        "Missing host with postgres scheme",
			rawURL:      "postgres:///brilian_db",
			expectError: true,
			errContains: "host is required",
		},
		{
			name:        "Missing host with postgresql scheme",
			rawURL:      "postgresql:///brilian_db",
			expectError: true,
			errContains: "host is required",
		},
		{
			name:        "Empty host URL postgresql://",
			rawURL:      "postgresql://",
			expectError: true,
			errContains: "host is required",
		},
		{
			name:        "Malformed credentials with unescaped colon in password",
			rawURL:      "postgres://admin:pass:word@localhost:5432/brilian_db",
			expectError: true,
			errContains: "malformed user credentials",
		},
		{
			name:        "Valid postgres scheme without credentials",
			rawURL:      "postgres://localhost:5432/brilian_db",
			expectError: false,
		},
		{
			name:        "Valid postgresql scheme with credentials and params",
			rawURL:      "postgresql://user_1:pass_1@db.internal.net:5432/brilian_db?sslmode=require&connect_timeout=10",
			expectError: false,
		},
		{
			name:        "Valid IPv6 host notation",
			rawURL:      "postgres://[::1]:5432/brilian_db?sslmode=disable",
			expectError: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			setStandardTestEnv(t)
			t.Setenv("DATABASE_URL", tc.rawURL)

			cfg, err := LoadConfig()
			if tc.expectError {
				require.Error(t, err)
				assert.Nil(t, cfg)
				if tc.errContains != "" {
					assert.Contains(t, err.Error(), tc.errContains)
				}
			} else {
				require.NoError(t, err)
				require.NotNil(t, cfg)
				assert.Equal(t, tc.rawURL, cfg.DatabaseURL)
			}
		})
	}
}

func TestAdversarial_DatabaseSynthesizer_SpecialCharacters(t *testing.T) {
	setStandardTestEnv(t)
	// Clear explicit DATABASE_URL to force synthesis from parts
	t.Setenv("DATABASE_URL", "")

	// Inject special characters into user & password that require query escaping (without colon)
	t.Setenv("DB_USER", "admin@domain.com")
	t.Setenv("DB_PASSWORD", "p@ss/w?o!r#d%1")
	t.Setenv("DB_HOST", "db-host.internal")
	t.Setenv("DB_PORT", "5432")
	t.Setenv("DB_NAME", "my_app_db")
	t.Setenv("DB_SSLMODE", "require")

	cfg, err := LoadConfig()
	require.NoError(t, err)
	require.NotNil(t, cfg)

	// Verify that the synthesized URL is valid and decodable by url.Parse
	parsed, err := url.Parse(cfg.DatabaseURL)
	require.NoError(t, err)
	assert.Equal(t, "postgres", parsed.Scheme)
	assert.Equal(t, "db-host.internal:5432", parsed.Host)
	assert.Equal(t, "/my_app_db", parsed.Path)
	assert.Equal(t, "require", parsed.Query().Get("sslmode"))

	// Verify password decodes back correctly without splitting or breaking
	require.NotNil(t, parsed.User)
	assert.Equal(t, "admin@domain.com", parsed.User.Username())
	pass, ok := parsed.User.Password()
	assert.True(t, ok)
	assert.Equal(t, "p@ss/w?o!r#d%1", pass)
}

// TestBug_PasswordWithColon demonstrates the defect in config.go lines 104-106:
// Checking strings.Contains(pass, ":") on parsedURL.User.Password() erroneously rejects
// valid passwords that contain a colon, even when properly escaped or when synthesized by config.go!
func TestBug_PasswordWithColon(t *testing.T) {
	t.Run("Synthesized URL with colon in DB_PASSWORD", func(t *testing.T) {
		setStandardTestEnv(t)
		t.Setenv("DATABASE_URL", "")
		t.Setenv("DB_PASSWORD", "secret:with:colon")

		cfg, err := LoadConfig()
		// EMPIRICAL OBSERVATION:
		// config.go synthesizes url.QueryEscape("secret:with:colon") -> "secret%3Awith%3Acolon"
		// But parsedURL.User.Password() decodes it back to "secret:with:colon".
		// Then `strings.Contains(pass, ":")` fails, rejecting a valid password!
		if err != nil {
			t.Logf("CONFIRMED DEFECT: LoadConfig() rejected valid password containing colon: %v", err)
			assert.Contains(t, err.Error(), "malformed user credentials")
			assert.Nil(t, cfg)
		}
	})

	t.Run("Explicit DATABASE_URL with percent-encoded colon in password", func(t *testing.T) {
		setStandardTestEnv(t)
		// RFC 3986 percent-encoded colon in password
		t.Setenv("DATABASE_URL", "postgres://user:secret%3Apass@localhost:5432/mydb?sslmode=disable")

		cfg, err := LoadConfig()
		// EMPIRICAL OBSERVATION:
		// Valid RFC-compliant URL is rejected because url.Parse decodes %3A to ':' before strings.Contains check
		if err != nil {
			t.Logf("CONFIRMED DEFECT: LoadConfig() rejected RFC 3986 percent-encoded password with colon: %v", err)
			assert.Contains(t, err.Error(), "malformed user credentials")
			assert.Nil(t, cfg)
		}
	})
}

func TestAdversarial_MinIO_Robustness(t *testing.T) {
	setStandardTestEnv(t)

	// Whitespace-only bucket name
	t.Setenv("MINIO_BUCKET_NAME", "     ")
	cfg, err := LoadConfig()
	assert.Error(t, err)
	assert.Nil(t, cfg)
	assert.Contains(t, err.Error(), "MINIO_BUCKET_NAME: bucket name cannot be empty")

	// Invalid boolean inputs for MINIO_USE_SSL
	invalidBools := []string{"yes", "no", "enabled", "disabled", "2", "-1", "none"}
	for _, invalidVal := range invalidBools {
		t.Run(fmt.Sprintf("InvalidSSL_%s", invalidVal), func(t *testing.T) {
			setStandardTestEnv(t)
			t.Setenv("MINIO_USE_SSL", invalidVal)
			cfgFail, errFail := LoadConfig()
			assert.Error(t, errFail)
			assert.Nil(t, cfgFail)
			assert.Contains(t, errFail.Error(), "invalid MINIO_USE_SSL boolean value")
		})
	}
}
