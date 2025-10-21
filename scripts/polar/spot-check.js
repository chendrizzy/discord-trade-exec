#!/usr/bin/env node
/*
 * Quick sanity check for Polar configuration.
 *
 * Usage:
 *   node scripts/polar/spot-check.js
 *
 * Requirements:
 *   POLAR_ACCESS_TOKEN and POLAR_ORGANIZATION_ID must be set in the environment.
 */

require('dotenv').config();
const { Polar } = require('@polar-sh/sdk');

const { POLAR_ACCESS_TOKEN, POLAR_ORGANIZATION_ID } = process.env;

if (!POLAR_ACCESS_TOKEN || !POLAR_ORGANIZATION_ID) {
  console.error('POLAR_ACCESS_TOKEN and POLAR_ORGANIZATION_ID must be set before running this script.');
  process.exit(1);
}

(async () => {
  const polar = new Polar({ accessToken: POLAR_ACCESS_TOKEN });

  try {
    const organization = await polar.organizations.get({ id: POLAR_ORGANIZATION_ID });
    console.log('✅ Connected to Polar organization:', {
      id: organization.id,
      name: organization.name,
      slug: organization.slug
    });
  } catch (error) {
    console.error('❌ Failed to fetch organization details. Double-check POLAR_ORGANIZATION_ID.');
    console.error(error.message || error);
    process.exit(1);
  }

  try {
    const iterator = await polar.products.list({
      organizationId: POLAR_ORGANIZATION_ID,
      limit: 10
    });

    const products = [];
    for await (const page of iterator) {
      if (page?.result?.items) {
        products.push(...page.result.items);
      }
      if (products.length >= 10) break;
    }

    console.log(`✅ Retrieved ${products.length} product(s) from Polar.`);
    products.forEach(product => {
      const firstPrice = product.prices?.[0];
      console.log(` • ${product.name} [${product.metadata?.type || 'n/a'} / ${product.metadata?.tier || 'n/a'}]`);
      if (firstPrice) {
        console.log(
          `    Price: $${(firstPrice.priceAmount / 100).toFixed(2)} ${firstPrice.priceCurrency?.toUpperCase()} (${product.recurringInterval})`
        );
      }
    });
  } catch (error) {
    console.error('⚠️ Failed to list products.');
    console.error(error.message || error);
  }
})();
