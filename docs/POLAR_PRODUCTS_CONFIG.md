# Polar.sh Product Configuration Guide

## Product Setup Overview

Create **8 separate products** in Polar.sh dashboard (1:1 product-price mapping required):
- 4 Community products (for server hosts)
- 4 Trader products (for individual members)

Each product requires metadata configuration:
```json
{
  "type": "community",  // or "trader"
  "tier": "professional" // or "enterprise" or "elite"
}
```

---

## Product 1: Professional Plan - Monthly

### a. Description
```
Professional trading signals platform for growing communities.

✓ Up to 100 community members
✓ 10 signal providers with advanced analytics
✓ 1,000 signals per day
✓ Real-time trade execution via broker integration
✓ Advanced risk management tools
✓ Priority support

Perfect for active trading communities ready to scale beyond free tier limits.
```

### b. Product Media
**Suggested Images**:
- Hero image: Dashboard screenshot showing professional-tier analytics
- Feature highlight: Multi-provider signal aggregation view
- Social proof: Community size meter showing 100 member capacity

**Recommended Dimensions**: 1200x630px (Open Graph standard)

### c. Pricing Configuration
- **Billing Period**: Monthly (recurring)
- **Pricing Model**: Fixed pricing
- **Price**: $99.00 USD/month
- **Billing Interval**: Every 1 month
- **One-Time Purchase**: No (recurring subscription)

### d. Automated Benefits
**Recommended Configuration**:
- ✅ **Custom** (0 configured)
  - Custom benefit: "Professional tier access with 100 member limit"
  - Description: "Automatically grants professional-tier subscription status"

- ✅ **Discord Invite** (0 configured)
  - Server invite link: `https://discord.gg/YOUR_SERVER_INVITE`
  - Role assignment: "Professional Member" role
  - Description: "Instant access to professional members Discord channel"

- ⬜ **GitHub Repository Access** (not applicable)
- ⬜ **File Downloads** (not applicable)
- ⬜ **License Keys** (not applicable)
- ⬜ **Meter Credits** (not applicable)

---

## Product 2: Professional Plan - Annual

### a. Description
```
Professional trading signals platform for growing communities - Annual billing.

✓ Up to 100 community members
✓ 10 signal providers with advanced analytics
✓ 1,000 signals per day
✓ Real-time trade execution via broker integration
✓ Advanced risk management tools
✓ Priority support
✓ SAVE 20% with annual billing ($950/year vs $1,188/year monthly)

Perfect for committed trading communities seeking maximum value.
```

### b. Product Media
**Suggested Images**:
- Hero image: Same dashboard screenshot as monthly (consistency)
- Badge overlay: "Save 20% - Annual Plan"
- Value proposition: Side-by-side monthly vs annual savings chart

**Recommended Dimensions**: 1200x630px (Open Graph standard)

### c. Pricing Configuration
- **Billing Period**: Yearly (recurring)
- **Pricing Model**: Fixed pricing
- **Price**: $950.00 USD/year
- **Billing Interval**: Every 12 months
- **One-Time Purchase**: No (recurring subscription)

### d. Automated Benefits
**Recommended Configuration**:
- ✅ **Custom** (0 configured)
  - Custom benefit: "Professional tier access with 100 member limit (annual)"
  - Description: "Automatically grants professional-tier subscription status"

- ✅ **Discord Invite** (0 configured)
  - Server invite link: `https://discord.gg/YOUR_SERVER_INVITE`
  - Role assignment: "Professional Member - Annual" role
  - Description: "Instant access to professional members Discord channel with annual supporter badge"

- ⬜ **GitHub Repository Access** (not applicable)
- ⬜ **File Downloads** (not applicable)
- ⬜ **License Keys** (not applicable)
- ⬜ **Meter Credits** (not applicable)

---

## Product 3: Enterprise Plan - Monthly

### a. Description
```
Enterprise-grade trading infrastructure for institutional communities.

✓ Up to 1,000 community members
✓ 50 signal providers with institutional analytics
✓ 10,000 signals per day
✓ Multi-broker execution with advanced routing
✓ Custom risk profiles and compliance controls
✓ White-label branding options
✓ Dedicated account manager
✓ SLA guarantee with priority support

Built for professional trading operations and institutional-grade communities.
```

### b. Product Media
**Suggested Images**:
- Hero image: Enterprise dashboard with advanced features
- Feature highlight: Multi-broker execution interface
- Trust indicator: Security/compliance badges (SOC 2, encryption)

**Recommended Dimensions**: 1200x630px (Open Graph standard)

### c. Pricing Configuration
- **Billing Period**: Monthly (recurring)
- **Pricing Model**: Fixed pricing
- **Price**: $299.00 USD/month
- **Billing Interval**: Every 1 month
- **One-Time Purchase**: No (recurring subscription)

### d. Automated Benefits
**Recommended Configuration**:
- ✅ **Custom** (0 configured)
  - Custom benefit: "Enterprise tier access with 1,000 member limit"
  - Description: "Automatically grants enterprise-tier subscription status"

- ✅ **Discord Invite** (0 configured)
  - Server invite link: `https://discord.gg/YOUR_ENTERPRISE_INVITE`
  - Role assignment: "Enterprise Member" role
  - Description: "Exclusive access to enterprise members Discord channel with dedicated support"

- ✅ **File Downloads** (0 configured) - Optional
  - File: "Enterprise Onboarding Guide.pdf"
  - Description: "Comprehensive setup guide for enterprise features"

- ⬜ **GitHub Repository Access** (not applicable)
- ⬜ **License Keys** (not applicable)
- ⬜ **Meter Credits** (not applicable)

---

## Product 4: Enterprise Plan - Annual

### a. Description
```
Enterprise-grade trading infrastructure for institutional communities - Annual billing.

✓ Up to 1,000 community members
✓ 50 signal providers with institutional analytics
✓ 10,000 signals per day
✓ Multi-broker execution with advanced routing
✓ Custom risk profiles and compliance controls
✓ White-label branding options
✓ Dedicated account manager
✓ SLA guarantee with priority support
✓ SAVE 20% with annual billing ($2,870/year vs $3,588/year monthly)

Maximum value for committed enterprise trading operations.
```

### b. Product Media
**Suggested Images**:
- Hero image: Same enterprise dashboard as monthly (consistency)
- Badge overlay: "Save 20% - Annual Plan"
- ROI calculator: Showing annual savings for enterprise tier

**Recommended Dimensions**: 1200x630px (Open Graph standard)

### c. Pricing Configuration
- **Billing Period**: Yearly (recurring)
- **Pricing Model**: Fixed pricing
- **Price**: $2,870.00 USD/year
- **Billing Interval**: Every 12 months
- **One-Time Purchase**: No (recurring subscription)

### d. Automated Benefits
**Recommended Configuration**:
- ✅ **Custom** (0 configured)
  - Custom benefit: "Enterprise tier access with 1,000 member limit (annual)"
  - Description: "Automatically grants enterprise-tier subscription status"

- ✅ **Discord Invite** (0 configured)
  - Server invite link: `https://discord.gg/YOUR_ENTERPRISE_INVITE`
  - Role assignment: "Enterprise Member - Annual" role
  - Description: "Exclusive access to enterprise members Discord channel with annual VIP badge"

- ✅ **File Downloads** (0 configured) - Optional
  - File: "Enterprise Onboarding Guide.pdf"
  - Description: "Comprehensive setup guide for enterprise features"

- ⬜ **GitHub Repository Access** (not applicable)
- ⬜ **License Keys** (not applicable)
- ⬜ **Meter Credits** (not applicable)

---

## Product 5: Trader Professional - Monthly

### a. Description
```
Professional trading execution for active individual traders.

✓ 100 signals per day (account-based, global across all communities)
✓ 3 broker connections
✓ Advanced risk management tools
✓ Real-time trade execution
✓ Priority signal processing
✓ Advanced analytics dashboard
✓ Multi-community access

Perfect for serious traders executing across multiple communities.
```

### b. Product Media
**Suggested Images**:
- Hero image: Trader dashboard showing multi-broker execution view
- Feature highlight: Account-based limit meter showing global signal count
- Value proposition: Multi-community trading interface

**Recommended Dimensions**: 1200x630px (Open Graph standard)

### c. Pricing Configuration
- **Billing Period**: Monthly (recurring)
- **Pricing Model**: Fixed pricing
- **Price**: $49.00 USD/month
- **Billing Interval**: Every 1 month
- **One-Time Purchase**: No (recurring subscription)
- **Product Metadata** (REQUIRED):
  ```json
  {
    "type": "trader",
    "tier": "professional"
  }
  ```

### d. Automated Benefits
**Recommended Configuration**:
- ✅ **Custom** (0 configured)
  - Custom benefit: "Trader professional tier (100 signals/day, 3 brokers)"
  - Description: "Automatically grants professional trader subscription status"

- ✅ **Discord Invite** (0 configured) - Optional
  - Server invite link: `https://discord.gg/YOUR_TRADER_SERVER`
  - Role assignment: "Professional Trader" role
  - Description: "Access to professional traders community"

- ⬜ **GitHub Repository Access** (not applicable)
- ⬜ **File Downloads** (not applicable)
- ⬜ **License Keys** (not applicable)
- ⬜ **Meter Credits** (not applicable)

---

## Product 6: Trader Professional - Annual

### a. Description
```
Professional trading execution for active individual traders - Annual billing.

✓ 100 signals per day (account-based, global across all communities)
✓ 3 broker connections
✓ Advanced risk management tools
✓ Real-time trade execution
✓ Priority signal processing
✓ Advanced analytics dashboard
✓ Multi-community access
✓ SAVE 20% with annual billing ($470/year vs $588/year monthly)

Maximum value for committed professional traders.
```

### b. Product Media
**Suggested Images**:
- Hero image: Same trader dashboard as monthly (consistency)
- Badge overlay: "Save 20% - Annual Plan"
- ROI calculator: Showing annual savings for trader tier

**Recommended Dimensions**: 1200x630px (Open Graph standard)

### c. Pricing Configuration
- **Billing Period**: Yearly (recurring)
- **Pricing Model**: Fixed pricing
- **Price**: $470.00 USD/year
- **Billing Interval**: Every 12 months
- **One-Time Purchase**: No (recurring subscription)
- **Product Metadata** (REQUIRED):
  ```json
  {
    "type": "trader",
    "tier": "professional"
  }
  ```

### d. Automated Benefits
**Recommended Configuration**:
- ✅ **Custom** (0 configured)
  - Custom benefit: "Trader professional tier (100 signals/day, 3 brokers) - Annual"
  - Description: "Automatically grants professional trader subscription status"

- ✅ **Discord Invite** (0 configured) - Optional
  - Server invite link: `https://discord.gg/YOUR_TRADER_SERVER`
  - Role assignment: "Professional Trader - Annual" role
  - Description: "Access to professional traders community with annual supporter badge"

- ⬜ **GitHub Repository Access** (not applicable)
- ⬜ **File Downloads** (not applicable)
- ⬜ **License Keys** (not applicable)
- ⬜ **Meter Credits** (not applicable)

---

## Product 7: Trader Elite - Monthly

### a. Description
```
Elite trading platform for professional traders with unlimited execution.

✓ UNLIMITED signals per day (account-based, global)
✓ UNLIMITED broker connections
✓ Advanced risk management with custom profiles
✓ Priority execution with fastest routing
✓ Premium analytics and performance tracking
✓ API access for custom integrations
✓ Dedicated trader support
✓ Multi-community premium access

Built for high-volume professional traders executing at scale.
```

### b. Product Media
**Suggested Images**:
- Hero image: Elite trader dashboard with advanced features
- Feature highlight: Unlimited signals badge with multi-broker view
- Trust indicator: Premium trader tier benefits showcase

**Recommended Dimensions**: 1200x630px (Open Graph standard)

### c. Pricing Configuration
- **Billing Period**: Monthly (recurring)
- **Pricing Model**: Fixed pricing
- **Price**: $149.00 USD/month
- **Billing Interval**: Every 1 month
- **One-Time Purchase**: No (recurring subscription)
- **Product Metadata** (REQUIRED):
  ```json
  {
    "type": "trader",
    "tier": "elite"
  }
  ```

### d. Automated Benefits
**Recommended Configuration**:
- ✅ **Custom** (0 configured)
  - Custom benefit: "Trader elite tier (unlimited signals, unlimited brokers)"
  - Description: "Automatically grants elite trader subscription status"

- ✅ **Discord Invite** (0 configured) - Optional
  - Server invite link: `https://discord.gg/YOUR_ELITE_TRADER_SERVER`
  - Role assignment: "Elite Trader" role
  - Description: "Exclusive access to elite traders community with priority support"

- ⬜ **GitHub Repository Access** (not applicable)
- ⬜ **File Downloads** (not applicable)
- ⬜ **License Keys** (not applicable)
- ⬜ **Meter Credits** (not applicable)

---

## Product 8: Trader Elite - Annual

### a. Description
```
Elite trading platform for professional traders with unlimited execution - Annual billing.

✓ UNLIMITED signals per day (account-based, global)
✓ UNLIMITED broker connections
✓ Advanced risk management with custom profiles
✓ Priority execution with fastest routing
✓ Premium analytics and performance tracking
✓ API access for custom integrations
✓ Dedicated trader support
✓ Multi-community premium access
✓ SAVE 20% with annual billing ($1,430/year vs $1,788/year monthly)

Ultimate value for committed elite traders.
```

### b. Product Media
**Suggested Images**:
- Hero image: Same elite trader dashboard as monthly (consistency)
- Badge overlay: "Save 20% - Annual Plan"
- Premium value: Elite tier benefits with annual savings showcase

**Recommended Dimensions**: 1200x630px (Open Graph standard)

### c. Pricing Configuration
- **Billing Period**: Yearly (recurring)
- **Pricing Model**: Fixed pricing
- **Price**: $1,430.00 USD/year
- **Billing Interval**: Every 12 months
- **One-Time Purchase**: No (recurring subscription)
- **Product Metadata** (REQUIRED):
  ```json
  {
    "type": "trader",
    "tier": "elite"
  }
  ```

### d. Automated Benefits
**Recommended Configuration**:
- ✅ **Custom** (0 configured)
  - Custom benefit: "Trader elite tier (unlimited signals, unlimited brokers) - Annual"
  - Description: "Automatically grants elite trader subscription status"

- ✅ **Discord Invite** (0 configured) - Optional
  - Server invite link: `https://discord.gg/YOUR_ELITE_TRADER_SERVER`
  - Role assignment: "Elite Trader - Annual" role
  - Description: "Exclusive access to elite traders community with annual VIP badge"

- ⬜ **GitHub Repository Access** (not applicable)
- ⬜ **File Downloads** (not applicable)
- ⬜ **License Keys** (not applicable)
- ⬜ **Meter Credits** (not applicable)

---

## Quick Reference Table

### Community Products (Server Hosts)

| Product | Price | Billing | Members | Providers | Signals/Day | Savings |
|---------|-------|---------|---------|-----------|-------------|---------|
| Professional Monthly | $99/mo | Monthly | 100 | 10 | 1,000 | - |
| Professional Annual | $950/yr | Yearly | 100 | 10 | 1,000 | 20% ($238/yr) |
| Enterprise Monthly | $299/mo | Monthly | 1,000 | 50 | 10,000 | - |
| Enterprise Annual | $2,870/yr | Yearly | 1,000 | 50 | 10,000 | 20% ($718/yr) |

### Trader Products (Individual Members)

| Product | Price | Billing | Signals/Day | Max Brokers | Features | Savings |
|---------|-------|---------|-------------|-------------|----------|---------|
| Professional Monthly | $49/mo | Monthly | 100 | 3 | Advanced | - |
| Professional Annual | $470/yr | Yearly | 100 | 3 | Advanced | 20% ($118/yr) |
| Elite Monthly | $149/mo | Monthly | Unlimited | Unlimited | Premium | - |
| Elite Annual | $1,430/yr | Yearly | Unlimited | Unlimited | Premium | 20% ($358/yr) |

---

## Product UUID Placeholders

After creating products in Polar.sh, you'll need to copy the product UUIDs and store them for checkout session creation:

```bash
# .env configuration (update after product creation)

# Community Products (Server Hosts)
POLAR_COMMUNITY_PROFESSIONAL_MONTHLY_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_COMMUNITY_PROFESSIONAL_ANNUAL_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_COMMUNITY_ENTERPRISE_MONTHLY_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_COMMUNITY_ENTERPRISE_ANNUAL_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Trader Products (Individual Members)
POLAR_TRADER_PROFESSIONAL_MONTHLY_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_TRADER_PROFESSIONAL_ANNUAL_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_TRADER_ELITE_MONTHLY_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_TRADER_ELITE_ANNUAL_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## Implementation Notes

### Discord Integration
If using Discord invites as automated benefits:
1. Create permanent invite links in Discord (Settings → Invites → Create Invite → Never Expire)
2. Set up role hierarchy in Discord server
3. Configure Polar.sh Discord integration with bot permissions
4. Map Polar products → Discord roles in Polar dashboard

### Custom Benefits
The "Custom" benefit type requires webhook handling:
- Polar.sh sends `subscription.created` webhook
- Your backend updates Community document: `subscription.tier = 'professional'` or `'enterprise'`
- Frontend reads tier from database, not from Polar.sh directly

### Product Media Assets
Create these assets before setting up products:
- [ ] Professional tier dashboard screenshot (1200x630px)
- [ ] Enterprise tier dashboard screenshot (1200x630px)
- [ ] "Save 17%" badge overlay for annual plans
- [ ] Feature comparison graphics (optional)

---

## Polar.sh Dashboard Setup Checklist

### Community Products Setup

- [ ] Log in to https://polar.sh dashboard
- [ ] Navigate to Products → Create Product
- [ ] Create Product 1: Community Professional Monthly
  - [ ] Add description from above
  - [ ] Upload product media
  - [ ] Configure pricing: $99/month, recurring, fixed
  - [ ] **Set product metadata**: `{"type": "community", "tier": "professional"}`
  - [ ] Add Custom benefit (professional tier)
  - [ ] Add Discord Invite benefit (if applicable)
  - [ ] Copy product UUID
- [ ] Create Product 2: Community Professional Annual
  - [ ] Add description from above
  - [ ] Upload product media
  - [ ] Configure pricing: $950/year, recurring, fixed
  - [ ] **Set product metadata**: `{"type": "community", "tier": "professional"}`
  - [ ] Add Custom benefit (professional tier annual)
  - [ ] Add Discord Invite benefit (if applicable)
  - [ ] Copy product UUID
- [ ] Create Product 3: Community Enterprise Monthly
  - [ ] Add description from above
  - [ ] Upload product media
  - [ ] Configure pricing: $299/month, recurring, fixed
  - [ ] **Set product metadata**: `{"type": "community", "tier": "enterprise"}`
  - [ ] Add Custom benefit (enterprise tier)
  - [ ] Add Discord Invite benefit (if applicable)
  - [ ] Add File Downloads benefit (onboarding guide - optional)
  - [ ] Copy product UUID
- [ ] Create Product 4: Community Enterprise Annual
  - [ ] Add description from above
  - [ ] Upload product media
  - [ ] Configure pricing: $2,870/year, recurring, fixed
  - [ ] **Set product metadata**: `{"type": "community", "tier": "enterprise"}`
  - [ ] Add Custom benefit (enterprise tier annual)
  - [ ] Add Discord Invite benefit (if applicable)
  - [ ] Add File Downloads benefit (onboarding guide - optional)
  - [ ] Copy product UUID

### Trader Products Setup

- [ ] Create Product 5: Trader Professional Monthly
  - [ ] Add description from above
  - [ ] Upload product media
  - [ ] Configure pricing: $49/month, recurring, fixed
  - [ ] **Set product metadata**: `{"type": "trader", "tier": "professional"}`
  - [ ] Add Custom benefit (trader professional tier)
  - [ ] Add Discord Invite benefit (if applicable)
  - [ ] Copy product UUID
- [ ] Create Product 6: Trader Professional Annual
  - [ ] Add description from above
  - [ ] Upload product media
  - [ ] Configure pricing: $470/year, recurring, fixed
  - [ ] **Set product metadata**: `{"type": "trader", "tier": "professional"}`
  - [ ] Add Custom benefit (trader professional tier annual)
  - [ ] Add Discord Invite benefit (if applicable)
  - [ ] Copy product UUID
- [ ] Create Product 7: Trader Elite Monthly
  - [ ] Add description from above
  - [ ] Upload product media
  - [ ] Configure pricing: $149/month, recurring, fixed
  - [ ] **Set product metadata**: `{"type": "trader", "tier": "elite"}`
  - [ ] Add Custom benefit (trader elite tier)
  - [ ] Add Discord Invite benefit (if applicable)
  - [ ] Copy product UUID
- [ ] Create Product 8: Trader Elite Annual
  - [ ] Add description from above
  - [ ] Upload product media
  - [ ] Configure pricing: $1,430/year, recurring, fixed
  - [ ] **Set product metadata**: `{"type": "trader", "tier": "elite"}`
  - [ ] Add Custom benefit (trader elite tier annual)
  - [ ] Add Discord Invite benefit (if applicable)
  - [ ] Copy product UUID

### Final Steps

- [ ] Update `.env` with all 8 product UUIDs
- [ ] Test checkout flow with each product (4 community + 4 trader)
- [ ] Verify webhook routing for both subscription types

---

**Estimated Setup Time**: 60-90 minutes (after assets are ready)

**CRITICAL**: Product metadata is REQUIRED for webhook routing to work correctly. Without it, the system cannot determine whether a subscription is for a community or trader.
