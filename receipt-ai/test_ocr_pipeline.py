import unittest

import ocr_pipeline


class ExtractLinesTest(unittest.TestCase):
    def test_sorts_normalizes_and_clamps_paddle_results(self):
        results = [
            {
                "res": {
                    "rec_texts": ["Total 4.20", "Test Market"],
                    "rec_scores": [0.994, 0.875],
                    "rec_boxes": [
                        [100, 800, 900, 850],
                        [-10, 20, 1010, 80],
                    ],
                }
            }
        ]

        lines = ocr_pipeline.extract_lines(results, width=1000, height=1000)

        self.assertEqual([line["text"] for line in lines], ["Test Market", "Total 4.20"])
        self.assertEqual(lines[0]["confidence"], 87.5)
        self.assertEqual(
            lines[0]["bbox"],
            {"x0": 0.0, "y0": 20.0, "x1": 1000.0, "y1": 80.0},
        )

    def test_accepts_polygon_boxes_and_ignores_empty_text(self):
        results = [
            {
                "rec_texts": ["", "Bread"],
                "rec_scores": [0.9, 0.8],
                "rec_polys": [
                    [[0, 0], [10, 0], [10, 10], [0, 10]],
                    [[20, 40], [80, 35], [90, 60], [15, 65]],
                ],
            }
        ]

        lines = ocr_pipeline.extract_lines(results, width=100, height=100)

        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["text"], "Bread")
        self.assertEqual(
            lines[0]["bbox"],
            {"x0": 150.0, "y0": 350.0, "x1": 900.0, "y1": 650.0},
        )


if __name__ == "__main__":
    unittest.main()
