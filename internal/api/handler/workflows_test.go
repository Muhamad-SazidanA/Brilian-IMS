package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/company/brilian-dms/internal/api/handler"
	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWorkflowHandler_Action_Success(t *testing.T) {
	wfHandler := handler.NewWorkflowHandler()

	actions := []string{"approve", "reject", "revise"}
	roles := []string{middleware.RoleReviewer, middleware.RoleAdmin}

	for _, role := range roles {
		for _, action := range actions {
			t.Run(role+"_"+action, func(t *testing.T) {
				payload := map[string]string{
					"action": action,
					"notes":  "Catatan peninjauan " + action,
				}
				body, _ := json.Marshal(payload)

				req := createAuthenticatedContextRequest(http.MethodPut, "/api/v1/workflows/wf-9988/action", bytes.NewReader(body), role, "usr-rev-1")
				req.SetPathValue("id", "wf-9988")
				rec := httptest.NewRecorder()

				wfHandler.Action(rec, req)

				assert.Equal(t, http.StatusOK, rec.Code)

				var res map[string]any
				err := json.Unmarshal(rec.Body.Bytes(), &res)
				require.NoError(t, err)

				assert.Equal(t, "success", res["status"])
				assert.Contains(t, res["message"], "Status workflow berhasil diperbarui")

				// Verify in-memory state
				record, exists := wfHandler.GetWorkflow("wf-9988")
				require.True(t, exists)
				assert.Equal(t, action, record.LastAction)
				assert.Equal(t, "Catatan peninjauan "+action, record.Notes)
				assert.Equal(t, "usr-rev-1", record.ActionBy)
			})
		}
	}
}

func TestWorkflowHandler_Action_RBAC_Forbidden(t *testing.T) {
	wfHandler := handler.NewWorkflowHandler()

	forbiddenRoles := []string{middleware.RoleUploader, middleware.RoleViewer}

	for _, role := range forbiddenRoles {
		t.Run(role+"_cannot_action", func(t *testing.T) {
			payload := map[string]string{
				"action": "approve",
				"notes":  "Self-approval attempt",
			}
			body, _ := json.Marshal(payload)

			req := createAuthenticatedContextRequest(http.MethodPut, "/api/v1/workflows/wf-9988/action", bytes.NewReader(body), role, "usr-upl-1")
			req.SetPathValue("id", "wf-9988")
			rec := httptest.NewRecorder()

			wfHandler.Action(rec, req)

			assert.Equal(t, http.StatusForbidden, rec.Code)
			var res map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)
			assert.Equal(t, "error", res["status"])
			assert.Contains(t, res["message"], "role does not have workflow action permission")
		})
	}
}

func TestWorkflowHandler_Action_InvalidActionVerb(t *testing.T) {
	wfHandler := handler.NewWorkflowHandler()

	invalidVerbs := []string{"destroy_file", "delete_database", "execute_malicious", "cancel", ""}

	for _, verb := range invalidVerbs {
		t.Run("verb_"+verb, func(t *testing.T) {
			payload := map[string]string{
				"action": verb,
				"notes":  "Invalid action attempt",
			}
			body, _ := json.Marshal(payload)

			req := createAuthenticatedContextRequest(http.MethodPut, "/api/v1/workflows/wf-9988/action", bytes.NewReader(body), middleware.RoleReviewer, "usr-rev-1")
			req.SetPathValue("id", "wf-9988")
			rec := httptest.NewRecorder()

			wfHandler.Action(rec, req)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			var res map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)
			assert.Equal(t, "error", res["status"])
			assert.Contains(t, res["message"], "Invalid action")
		})
	}
}

func TestWorkflowHandler_Action_Unauthenticated(t *testing.T) {
	wfHandler := handler.NewWorkflowHandler()

	req := httptest.NewRequest(http.MethodPut, "/api/v1/workflows/wf-1/action", nil)
	rec := httptest.NewRecorder()

	wfHandler.Action(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}
