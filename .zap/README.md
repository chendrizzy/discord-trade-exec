# OWASP ZAP Security Scanning Configuration

This directory contains configuration for automated OWASP ZAP security scans as part of **US-009: OWASP Top 10 Security Audit** (P1 - COMPLIANCE MANDATE).

## Constitutional Requirement

**Principle I: Security-First (NON-NEGOTIABLE)** mandates OWASP Top 10 compliance before production deployment.

**FR-071**: System SHALL pass OWASP Top 10 security audit with 0 Critical and 0 High severity findings before production deployment.

## Files

- **`rules.tsv`**: ZAP scan rules configuration mapping OWASP Top 10 (2021) categories to ZAP rule IDs
  - `FAIL`: Critical/High severity - blocks deployment
  - `WARN`: Medium severity - requires documentation
  - `INFO`: Low severity - informational only
  - `IGNORE`: False positives or accepted risks

## Workflow Usage

### Manual Trigger (GitHub Actions)

1. Go to **Actions** → **OWASP ZAP Security Scan**
2. Click **Run workflow**
3. Configure:
   - **Target URL**: Staging environment URL (default: `https://discord-trade-exec-staging.up.railway.app`)
   - **Scan Type**: 
     - `baseline` (10-30 minutes): Quick passive scan for common vulnerabilities
     - `full` (4-6 hours): Comprehensive active scan with spider and attack simulations
   - **Generate Reports**: Enable HTML/JSON/XML report generation

### Scan Types

#### Baseline Scan (Recommended for CI/CD)
- **Duration**: 10-30 minutes
- **Method**: Passive analysis of HTTP traffic
- **Coverage**: Common OWASP Top 10 vulnerabilities
- **Use Case**: Pre-deployment checks, PR validation

#### Full Scan (Required for Audit Compliance)
- **Duration**: 4-6 hours
- **Method**: Active spider + attack simulations
- **Coverage**: Comprehensive OWASP Top 10 + CVEs
- **Use Case**: Security audits, quarterly reviews, pre-production certification

## Report Artifacts

After scan completion, download artifacts from GitHub Actions:

- **`zap-report.html`**: Human-readable detailed report with remediation guidance
- **`zap-report.json`**: Machine-readable JSON for automation
- **`zap-report.xml`**: XML format for integration with security tools
- **`compliance-badge.svg`**: Badge showing OWASP compliance status

## Compliance Verification

The workflow automatically checks FR-071 compliance:

```
✅ PASSED: 0 Critical and 0 High findings → Cleared for production
❌ FAILED: N Critical or M High findings → Deployment blocked
```

## OWASP Top 10 (2021) Coverage

| Category | Rules | Severity |
|----------|-------|----------|
| **A01:2021** - Broken Access Control | 10006, 10011, 10033, 10054, 10098 | FAIL |
| **A02:2021** - Cryptographic Failures | 10020, 10024, 10035, 10059, 10070 | FAIL |
| **A03:2021** - Injection | 40008, 40012, 40018-40027, 90019-90023 | FAIL |
| **A04:2021** - Insecure Design | (Manual review + architecture) | N/A |
| **A05:2021** - Security Misconfiguration | 10010, 10016, 10071, 90003 | FAIL |
| **A06:2021** - Vulnerable Components | 10068, 10069 | FAIL |
| **A07:2021** - Authentication Failures | 10103, 10105, 10101, 10102 | FAIL |
| **A08:2021** - Data Integrity Failures | 90005 | FAIL |
| **A09:2021** - Logging Failures | 10009 | FAIL |
| **A10:2021** - SSRF | 40009, 90024 | FAIL |

## Remediation Workflow

When scan detects Critical or High findings:

1. **Review Findings**
   - Download `zap-report.html` artifact
   - Identify affected endpoints and components
   - Review ZAP's remediation guidance

2. **Create Issues**
   - One GitHub issue per unique vulnerability
   - Priority: Critical = P0 (48 hours), High = P1 (1 week), Medium = P2 (2 weeks)
   - Include: Description, Affected URLs, CWE ID, Remediation steps

3. **Remediate**
   - Fix vulnerabilities following OWASP guidance
   - Add regression tests to prevent reintroduction
   - Update security documentation

4. **Verify**
   - Re-run ZAP scan against staging
   - Confirm findings resolved
   - Update compliance status

5. **Document**
   - For Medium/Low findings: Document accepted risks with business justification
   - Update security baseline in `SECURITY.md`
   - Archive scan reports in `docs/security/zap-reports/`

## Integration with Deployment Pipeline

**T056 Implementation**: Manual workflow trigger (not blocking CI by default)

- Automated scans recommended **before** each staging deployment
- Full scans required **before** production deployment
- Compliance check integrated into Railway deployment checklist

## Local Testing (Optional)

Run ZAP scan locally using Docker:

```bash
# Baseline scan
docker run -v $(pwd):/zap/wrk/:rw \
  -t owasp/zap2docker-stable zap-baseline.py \
  -t https://localhost:3000 \
  -r zap-report.html \
  -J zap-report.json

# Full scan (requires daemon mode)
docker run -u zap -p 8080:8080 \
  -v $(pwd):/zap/wrk/:rw \
  -t owasp/zap2docker-stable zap-full-scan.py \
  -t https://localhost:3000 \
  -r zap-report.html \
  -J zap-report.json
```

## Security Best Practices

1. **Never scan production** - Only scan staging/test environments
2. **Rate limiting** - ZAP respects rate limits but can still overwhelm APIs
3. **Authentication** - Configure ZAP context for authenticated scans (see ZAP docs)
4. **Exclusions** - Add known false positives to rules.tsv with `IGNORE`
5. **Regular scans** - Run full scans quarterly or after major releases

## References

- [OWASP ZAP Documentation](https://www.zaproxy.org/docs/)
- [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
- [ZAP GitHub Action](https://github.com/zaproxy/action-baseline)
- Project Spec: `specs/003-discord-trade-executor-main/spec.md` (US-009)
- Security Policy: `SECURITY.md`

---

**Status**: T056 Complete ✅  
**Compliance**: FR-071 enforcement automated  
**Next**: Schedule third-party penetration test for full US-009 completion
