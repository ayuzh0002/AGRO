"""
test_gee.py – Quick test script to verify Google Earth Engine (GEE) connection.

Usage:
    python test_gee.py
"""

import os
import json
import ee

KEY_PATH = "gee_service_account.json"

def test_connection():
    print("=" * 60)
    print("[*] Testing Google Earth Engine (GEE) Connection...")
    print("=" * 60)

    if not os.path.exists(KEY_PATH):
        print(f"[!] Key file '{KEY_PATH}' not found in the project root.")
        return

    try:
        with open(KEY_PATH, "r") as f:
            data = json.load(f)

        client_email = data.get("client_email")
        project_id = data.get("project_id")

        print(f"[+] Found Key File: {KEY_PATH}")
        print(f"[+] Service Account: {client_email}")
        print(f"[+] Cloud Project:   {project_id}")
        print("-" * 60)
        print("Authenticating with Earth Engine API...")

        creds = ee.ServiceAccountCredentials(client_email, KEY_PATH)
        ee.Initialize(creds, project=project_id)

        print("\n[SUCCESS] Google Earth Engine initialized successfully!")
        
        # Test query: Fetch Sentinel-2 image collection count
        point = ee.Geometry.Point([79.0882, 21.1458])
        collection = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(point)
            .filterDate("2024-01-01", "2024-01-31")
        )
        count = collection.size().getInfo()
        print(f"[+] Sentinel-2 test scenes found: {count}")
        print("[+] Earth Engine is ready for real-time NDVI and satellite data!")

    except ee.EEException as e:
        print("\n[X] Earth Engine Error:")
        print(f"   {e}")
        if "not registered to use Earth Engine" in str(e):
            print("\n[ACTION REQUIRED]:")
            print(f"   1. Open: https://console.cloud.google.com/earth-engine/configuration?project={project_id}")
            print("   2. Click 'Register Project' / 'Choose or create Cloud Project' and select Commercial or Non-commercial (Research/Education).")
            print("   3. Accept the terms of service.")
            print("   4. Once registered, re-run this test script.")
        else:
            print("\n[ACTION REQUIRED]:")
            print(f"   1. Visit: https://console.developers.google.com/iam-admin/iam?project={project_id}")
            print(f"   2. Service Account: {client_email}")
            print("   3. Ensure roles 'Earth Engine Resource Viewer' and 'Service Usage Consumer' are assigned.")

    except Exception as e:
        print(f"\n[X] Unexpected error: {e}")

if __name__ == "__main__":
    test_connection()
