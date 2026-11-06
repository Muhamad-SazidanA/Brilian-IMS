package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/company/brilian-dms/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMainServer_InitializationAndRouting(t *testing.T) {
	// 1. Create a dynamic loopback listener on port 0
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	serverAddr := ln.Addr().String()

	cfg := &config.Config{
		ServerPort: fmt.Sprintf("%d", ln.Addr().(*net.TCPAddr).Port),
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	serverDone := make(chan error, 1)
	go func() {
		serverDone <- RunWithListener(ctx, cfg, ln)
	}()

	// Wait briefly for server to be responsive
	baseURL := "http://" + serverAddr
	client := &http.Client{Timeout: 3 * time.Second}

	var lastErr error
	var ready bool
	for i := 0; i < 30; i++ {
		resp, err := client.Get(baseURL + "/health")
		if err == nil {
			resp.Body.Close()
			ready = true
			break
		}
		lastErr = err
		time.Sleep(50 * time.Millisecond)
	}
	require.True(t, ready, "Server failed to start in time: %v", lastErr)

	// Subtest 1: Verify /health
	t.Run("GET /health", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/health")
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var body map[string]string
		err = json.NewDecoder(resp.Body).Decode(&body)
		require.NoError(t, err)
		assert.Equal(t, "healthy", body["status"])
	})

	// Subtest 2: Verify /api/v1/health
	t.Run("GET /api/v1/health", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/api/v1/health")
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var body map[string]string
		err = json.NewDecoder(resp.Body).Decode(&body)
		require.NoError(t, err)
		assert.Equal(t, "healthy", body["status"])
	})

	// Subtest 3: Verify /api/v1 404 for undefined routes
	t.Run("GET /api/v1/undefined-endpoint returns 404 JSON", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/api/v1/undefined-endpoint")
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		assert.Contains(t, resp.Header.Get("Content-Type"), "application/json")
		var body map[string]any
		err = json.NewDecoder(resp.Body).Decode(&body)
		require.NoError(t, err)
		assert.Equal(t, "error", body["status"])
	})

	// Subtest 4: Verify static frontend index or SPA fallback
	t.Run("GET / serves index.html or SPA fallback", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/")
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		assert.Contains(t, string(bodyBytes), "<!doctype html>")
	})

	// Subtest 5: Verify SPA route fallback (e.g. /documents)
	t.Run("GET /documents serves SPA HTML fallback", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/documents")
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		assert.Contains(t, string(bodyBytes), "<!doctype html>")
	})

	// Subtest 6: Graceful shutdown on context cancellation
	cancel()

	select {
	case err := <-serverDone:
		require.NoError(t, err, "Graceful shutdown should succeed without error")
	case <-time.After(5 * time.Second):
		t.Fatal("Server did not shut down gracefully within timeout")
	}

	// Verify listener is closed
	_, err = client.Get(baseURL + "/health")
	assert.Error(t, err, "Server should be stopped and reject connections")
}

func TestMainServer_BuildServerDefaults(t *testing.T) {
	t.Run("Nil config falls back to port 8080", func(t *testing.T) {
		srv := BuildServer(nil, nil)
		assert.Equal(t, ":8080", srv.Addr)
		assert.Equal(t, 15*time.Second, srv.ReadTimeout)
		assert.Equal(t, 15*time.Second, srv.WriteTimeout)
		assert.Equal(t, 60*time.Second, srv.IdleTimeout)
	})

	t.Run("Custom port is applied", func(t *testing.T) {
		cfg := &config.Config{ServerPort: "9090"}
		srv := BuildServer(cfg, nil)
		assert.Equal(t, ":9090", srv.Addr)
	})
}

func TestMainServer_RunWithConfigLoading(t *testing.T) {
	// Find an available port dynamically
	tempLn, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	freePort := fmt.Sprintf("%d", tempLn.Addr().(*net.TCPAddr).Port)
	_ = tempLn.Close()

	// Provide required env vars for config.LoadConfig()
	t.Setenv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	t.Setenv("SERVER_PORT", freePort)

	ctx, cancel := context.WithCancel(context.Background())

	// Cancel after brief moment to test clean shutdown through Run()
	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()

	err = Run(ctx, nil)
	assert.NoError(t, err, "Run() should execute and gracefully shut down without panic")
}
