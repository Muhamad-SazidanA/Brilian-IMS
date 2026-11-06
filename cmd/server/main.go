package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/company/brilian-dms/internal/api"
	"github.com/company/brilian-dms/internal/config"
)

// DefaultShutdownTimeout is the duration to wait for in-flight requests to complete during graceful shutdown.
const DefaultShutdownTimeout = 10 * time.Second

// BuildServer constructs an *http.Server instance configured with timeouts and the router handler.
func BuildServer(cfg *config.Config, handler http.Handler) *http.Server {
	port := "8080"
	if cfg != nil && cfg.ServerPort != "" {
		port = cfg.ServerPort
	}

	return &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
}

// RunWithListener starts the HTTP server on a specified net.Listener and blocks until ctx is canceled
// or the server encounters a non-recoverable error. It handles graceful shutdown when ctx is cancelled.
func RunWithListener(ctx context.Context, cfg *config.Config, ln net.Listener) error {
	router := api.NewRouter(cfg)
	srv := BuildServer(cfg, router)

	serverErr := make(chan error, 1)
	go func() {
		log.Printf("[BrilianIDMS] Engine listening on http://%s", ln.Addr().String())
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
		close(serverErr)
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		log.Println("[BrilianIDMS] Shutdown signal received, initiating graceful shutdown...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), DefaultShutdownTimeout)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("[BrilianIDMS] Graceful shutdown error: %v; forcing close", err)
			_ = srv.Close()
			return fmt.Errorf("graceful shutdown failed: %w", err)
		}
		log.Println("[BrilianIDMS] Server gracefully stopped.")
		return nil
	}
}

// Run loads configuration (if cfg is nil), binds to cfg.ServerPort, and runs the server with graceful shutdown.
func Run(ctx context.Context, cfg *config.Config) error {
	if cfg == nil {
		var err error
		cfg, err = config.LoadConfig()
		if err != nil {
			return fmt.Errorf("failed to load configuration: %w", err)
		}
	}

	port := cfg.ServerPort
	if port == "" {
		port = "8080"
	}

	ln, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return fmt.Errorf("failed to bind server port %s: %w", port, err)
	}

	return RunWithListener(ctx, cfg, ln)
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("[BrilianIDMS] Fatal configuration error: %v", err)
	}

	log.Printf("[BrilianIDMS] Starting enterprise server on port :%s (GinMode=%s)", cfg.ServerPort, cfg.GinMode)

	if err := Run(ctx, cfg); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("[BrilianIDMS] Server terminated with error: %v", err)
	}
}
