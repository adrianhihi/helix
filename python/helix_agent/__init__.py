"""
Helix Agent — Python SDK for self-healing AI agent payments.

Usage:
    from helix_agent import HelixClient, helix_wrap, helix_guard
"""

from .client import HelixClient
from .decorator import helix_wrap
from .guard import helix_guard

__version__ = "0.2.0"
__all__ = ["HelixClient", "helix_wrap", "helix_guard"]
