"""
Test suite for RAG Code Review Assistant
Run with: pytest tests/test_api.py -v
"""
import pytest
from fastapi.testclient import TestClient
from main import app
import os

# Set test environment
os.environ["OPENAI_API_KEY"] = "test-key"

client = TestClient(app)

def test_root_endpoint():
    """Test root endpoint returns API info"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "version" in data
    assert data["version"] == "1.0.0"

def test_health_check():
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "healthy"
    assert "repos_loaded" in data
    assert "openai_configured" in data

def test_list_repos_empty():
    """Test listing repos when none exist"""
    response = client.get("/api/repos")
    assert response.status_code == 200
    data = response.json()
    assert "repos" in data
    assert "total" in data
    assert data["total"] == 0

def test_analyze_repo_missing_url():
    """Test analyze endpoint with missing URL"""
    response = client.post("/api/analyze-repo", json={})
    assert response.status_code == 422  # Validation error

def test_analyze_repo_invalid_url():
    """Test analyze endpoint with invalid URL"""
    response = client.post("/api/analyze-repo", json={
        "repo_url": "not-a-url"
    })
    assert response.status_code == 422

def test_query_nonexistent_repo():
    """Test query endpoint with non-existent repo"""
    response = client.post("/api/query", json={
        "question": "What does this code do?",
        "repo_id": "nonexistent-repo"
    })
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

def test_review_nonexistent_repo():
    """Test review endpoint with non-existent repo"""
    response = client.post("/api/review", json={
        "repo_id": "nonexistent-repo",
        "review_type": "security"
    })
    assert response.status_code == 404

def test_delete_nonexistent_repo():
    """Test delete endpoint with non-existent repo"""
    response = client.delete("/api/repos/nonexistent-repo")
    assert response.status_code == 404

def test_invalid_review_type():
    """Test review with invalid review type"""
    response = client.post("/api/review", json={
        "repo_id": "test-repo",
        "review_type": "invalid-type"
    })
    assert response.status_code == 422

# Integration tests (require actual OpenAI API key)
@pytest.mark.skipif(
    not os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY") == "test-key",
    reason="Requires real OpenAI API key"
)
class TestIntegration:
    
    def test_full_workflow(self):
        """Test complete workflow: analyze -> query -> review -> delete"""
        
        # 1. Analyze a small public repo
        analyze_response = client.post("/api/analyze-repo", json={
            "repo_url": "https://github.com/anthropics/anthropic-sdk-python",
            "branch": "main"
        })
        
        if analyze_response.status_code == 200:
            data = analyze_response.json()
            repo_id = data["repo_id"]
            
            # 2. Query the repo
            query_response = client.post("/api/query", json={
                "question": "What is the main purpose of this library?",
                "repo_id": repo_id
            })
            assert query_response.status_code == 200
            
            # 3. Get a review
            review_response = client.post("/api/review", json={
                "repo_id": repo_id,
                "review_type": "security"
            })
            assert review_response.status_code == 200
            
            # 4. Delete the repo
            delete_response = client.delete(f"/api/repos/{repo_id}")
            assert delete_response.status_code == 200

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
