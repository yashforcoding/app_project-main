---
name: Supabase connector paths
description: The connected Supabase proxy may already be rooted at PostgREST; verify the configured base before composing REST paths.
---

Use the connector-relative table path when the Supabase connection is configured with the PostgREST base URL; repeating `/rest/v1` produces an invalid-path response.

**Why:** Connector configuration can include provider URL prefixes, while setup examples may show the full provider URL path.

**How to apply:** Confirm the base with one read through the connected proxy before finalizing server-side Supabase requests.