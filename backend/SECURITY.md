# Security Policy — Resume AI System Backend

## API Keys and Credentials

### Golden Rule
**Never commit real API keys or secrets to git. Ever.**

- `.env` contains real secrets → **Keep in `.gitignore`**
- `.env.example` shows structure only → **Safe to commit** (no real values)
- `settings.py` declares variables only → **Never hardcode values** (even expired keys)
- Frontend never receives backend API keys

### Gemini API Key Configuration

#### Format (Explicit, Not CSV)

```env
GOOGLE_API_KEY_1=your-real-key-here
GOOGLE_API_KEY_2=another-real-key
GOOGLE_API_KEY_3=
GOOGLE_API_KEY_4=
GOOGLE_API_KEY_5=
```

**Why not CSV?**
- CSV parsing is error-prone
- `GOOGLE_API_KEYS=key1,key2` → easy to forget trailing commas, spaces
- Explicit fields are clearer and safer

#### What Happens to Each Key

1. **Normal operation:** Keys are tried in order (1, 2, 3, ...) until one works
2. **Rate-limited (429):** Key gets a cooldown timer, next key is tried
3. **Invalid key (400 "API key not valid"):** Key is permanently marked invalid in memory, next key is tried
4. **All keys fail:** Analysis fails with clear error message

#### Admin Health Check

```bash
curl http://localhost:8000/api/v1/admin/health/gemini
```

Response example:
```json
{
  "configured_key_count": 2,
  "available_key_count": 1,
  "cooldown_key_count": 1,
  "cooldowns": [
    {
      "key_label": "key_1",
      "retry_after_seconds": 45
    }
  ],
  "invalid_key_count": 0,
  "invalid_keys": []
}
```

### Other Sensitive Values

| Variable | Sensitivity | Where | Notes |
|----------|-------------|-------|-------|
| `GOOGLE_API_KEY_*` | 🔴 High | `.env` | Grants API access; regenerate if leaked |
| `JWT_SECRET_KEY` | 🔴 High | `.env` | Session security; regenerate if leaked |
| `APP_SECRET_KEY` | 🟠 Medium | `.env` | General crypto; should be unique per env |
| `ANTHROPIC_API_KEY` | 🔴 High | `.env` | API access; regenerate if leaked |
| `DATABASE_URL` (password) | 🔴 High | `.env` | DB access; rotate in all envs if leaked |
| `AWS_SECRET_ACCESS_KEY` | 🔴 High | `.env` | S3 access; regenerate if leaked |
| `GOOGLE_CLIENT_SECRET` | 🔴 High | `.env` | OAuth app; regenerate if leaked |
| `FIELD_ENCRYPTION_KEY` | 🔴 High | `.env` | Encrypted data; **do not rotate carelessly** |
| `SENTRY_DSN` | 🟠 Medium | `.env` | Public endpoint; not secret |
| Public settings (model, timeout) | 🟢 Low | Can commit | No sensitive info |

### Rotation Policy

**Frequency:**
- Monthly review for development
- Quarterly for staging
- After any suspected compromise: **immediate**

**Gemini Keys:**
1. Generate new key in Google Cloud Console
2. Update `.env` with new key (e.g., rotate key_1 to key_2)
3. Monitor `/admin/health/gemini` until old key is no longer in cooldown
4. Delete old key from Google Cloud Console

**Database/AWS/JWT Secrets:**
1. Generate new secret
2. Update `.env`
3. Restart worker (background job queue will use new secret)
4. **Do NOT rotate `FIELD_ENCRYPTION_KEY`** without data migration

### Frontend Security

✅ **Safe:** Frontend makes API calls to `/api/v1/...` endpoints
❌ **Never:** Hardcoding API keys in frontend code
❌ **Never:** Sending Gemini key to frontend in any endpoint
❌ **Never:** Exposing backend secrets in error responses

All API keys are used only in backend workers, never exposed to clients.

### Environment-Specific Security

**Development (`APP_ENV=development`)**
- `.env` is developer's personal file
- Never commit `.env` (use `.env.example`)
- Acceptable to use shared dev API keys for testing
- Always test with `ENABLE_DEV_MOCK=false` before shipping

**Staging (`APP_ENV=staging`)**
- Use dedicated API keys for staging environment
- Rotate keys monthly
- Monitor usage for anomalies
- Enable Sentry for error tracking

**Production (`APP_ENV=production`)**
- Isolated, high-security keys
- Rotate quarterly (or on schedule)
- Monitor with Sentry + alerting
- Restrict API key permissions (IP whitelist, rate limits in Google Cloud)
- Use secrets manager (AWS Secrets Manager / Google Secret Manager)

### If a Key is Leaked

1. **Immediately:**
   - Regenerate the key in Google Cloud Console
   - Update `.env` with new key
   - Restart all worker processes
   - Delete the old key from Google Cloud

2. **Monitor:**
   - Check Google Cloud logs for unauthorized access
   - Check `/admin/health/gemini` to confirm old key is not being used
   - Watch for unexpected analysis costs

3. **Post-mortem:**
   - Determine how key was exposed
   - Update security practices to prevent recurrence
   - Document in incident log

### Logging

✅ **Safe to log:**
- API response bodies (error messages, structure)
- Status codes, headers (non-sensitive)
- Timing, retry counts

❌ **Never log:**
- API keys (even partial)
- Passwords, JWT secrets
- Database passwords
- Bearer tokens

Logs are sanitized by `log_sanitizer.py` which redacts URLs with API keys.

### Code Review Checklist

Before committing, verify:
- [ ] No real API keys in code
- [ ] No hardcoded secrets in `settings.py`
- [ ] `.env` is in `.gitignore`
- [ ] `.env.example` has only placeholder values
- [ ] Logs don't leak secrets (check `log_sanitizer` usage)
- [ ] Frontend cannot access backend API keys
- [ ] Tests use mock/example keys, not real ones

### Questions?

Contact: security@resume.ai or open a security issue (not public).
