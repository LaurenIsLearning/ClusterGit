import os
from supabase import create_client, Client
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Supabase configuration - you'll need to fill these in
SUPABASE_URL = "https://wvuvoyxxiakpfysscipw.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dXZveXh4aWFrcGZ5c3NjaXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTgyMDQsImV4cCI6MjA3NzQzNDIwNH0.G0Y7kRHPto1g4ZcruKqfMcpq6i_bIIiq9wWxqJXwZAQ"

def get_supabase_client() -> Client:
    """Initialize and return Supabase client"""
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized")
        return supabase
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        raise

# Test connection
if __name__ == "__main__":
    client = get_supabase_client()
    print("Supabase connection test successful!")