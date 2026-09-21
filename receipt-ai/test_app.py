import json
import unittest
from unittest.mock import AsyncMock, patch

import app


class AnalyzeWithQwenTest(unittest.IsolatedAsyncioTestCase):
    async def test_uses_bounded_instruct_model_request(self):
        model_response = {
            "message": {
                "content": json.dumps(
                    {
                        "merchant": "Test Market",
                        "date": "2026-09-21",
                        "currency": "EUR",
                        "subtotal": 4.2,
                        "tax": 0.2,
                        "total": 4.2,
                        "items": [
                            {
                                "name": "Bread",
                                "quantity": 1,
                                "unitPrice": 4.2,
                                "total": 4.2,
                            }
                        ],
                    }
                )
            },
            "load_duration": 1_000_000,
            "prompt_eval_duration": 2_000_000,
            "eval_duration": 3_000_000,
            "prompt_eval_count": 20,
            "eval_count": 30,
        }

        with patch.object(
            app, "ollama_request", new=AsyncMock(return_value=model_response)
        ) as request:
            receipt = await app.analyze_with_qwen(b"image", "eng")

        self.assertEqual(receipt["receipt"]["total"], 4.2)
        path, payload = request.await_args.args
        self.assertEqual(path, "/api/chat")
        self.assertEqual(payload["model"], "qwen3-vl:2b-instruct")
        self.assertEqual(payload["options"]["num_predict"], 1024)
        self.assertFalse(payload["stream"])


if __name__ == "__main__":
    unittest.main()
