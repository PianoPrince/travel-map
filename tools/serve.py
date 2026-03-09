from __future__ import annotations

import argparse
import http.server
import os
import socketserver
from pathlib import Path


class TravelRequestHandler(http.server.SimpleHTTPRequestHandler):
    pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the travel map prototype.")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind the local HTTP server.")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    os.chdir(root)

    with socketserver.TCPServer(("127.0.0.1", args.port), TravelRequestHandler) as httpd:
        print(f"Serving {root} at http://127.0.0.1:{args.port}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == "__main__":
    main()
