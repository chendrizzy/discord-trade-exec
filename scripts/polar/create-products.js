#!/usr/bin/env node
/*
 * Helper script to scaffold Polar subscription products using the official SDK.
 *
 * Usage:
 *   node scripts/polar/create-products.js
 *
 * Requirements:
 *   POLAR_ACCESS_TOKEN and POLAR_ORGANIZATION_ID must be set in the environment.
 *   The access token must have `products:write` scope.
 */

require('dotenv').config();
const { Polar } = require('@polar-sh/sdk');

const { POLAR_ACCESS_TOKEN, POLAR_ORGANIZATION_ID } = process.env;

if (!POLAR_ACCESS_TOKEN || !POLAR_ORGANIZATION_ID) {
  console.error('POLAR_ACCESS_TOKEN and POLAR_ORGANIZATION_ID must be set before running this script.');
  process.exit(1);
}

const productDefinitions = [
  {
    name: 'Community Professional Plan - Monthly',
    description: 'Professional trading signals platform for growing communities.',
    metadata: { type: 'community', tier: 'professional' },
    recurringInterval: 'month',
    priceAmount: 9900
  },
  {
    name: 'Community Professional Plan - Annual',
    description: 'Professional trading signals platform for growing communities - billed annually (save 20%).',
    metadata: { type: 'community', tier: 'professional' },
    recurringInterval: 'year',
    priceAmount: 95000
  },
  {
    name: 'Community Enterprise Plan - Monthly',
    description: 'Enterprise-grade trading automation for large communities.',
    metadata: { type: 'community', tier: 'enterprise' },
    recurringInterval: 'month',
    priceAmount: 29900
  },
  {
    name: 'Community Enterprise Plan - Annual',
    description: 'Enterprise-grade trading automation for large communities - billed annually (save 20%).',
    metadata: { type: 'community', tier: 'enterprise' },
    recurringInterval: 'year',
    priceAmount: 299000
  },
  {
    name: 'Trader Professional - Monthly',
    description: 'Professional trading execution for active individual traders.',
    metadata: { type: 'trader', tier: 'professional' },
    recurringInterval: 'month',
    priceAmount: 4900
  },
  {
    name: 'Trader Professional - Annual',
    description: 'Professional trading execution for active individual traders - billed annually (save 20%).',
    metadata: { type: 'trader', tier: 'professional' },
    recurringInterval: 'year',
    priceAmount: 47000
  },
  {
    name: 'Trader Elite - Monthly',
    description: 'Elite trading platform with unlimited execution for power users.',
    metadata: { type: 'trader', tier: 'elite' },
    recurringInterval: 'month',
    priceAmount: 14900
  },
  {
    name: 'Trader Elite - Annual',
    description: 'Elite trading platform with unlimited execution - billed annually (save 20%).',
    metadata: { type: 'trader', tier: 'elite' },
    recurringInterval: 'year',
    priceAmount: 143000
  }
];

(async () => {
  const polar = new Polar({ accessToken: POLAR_ACCESS_TOKEN });

  let existingNames = new Set();
  try {
    const iterator = await polar.products.list({
      organizationId: POLAR_ORGANIZATION_ID,
      limit: 100
    });

    for await (const page of iterator) {
      const items = page?.result?.items || [];
      for (const product of items) {
        existingNames.add(product.name.toLowerCase());
      }
    }

    console.log(`Found ${existingNames.size} existing product(s) in Polar.`);
  } catch (error) {
    console.warn('Warning: Failed to list existing products. Continuing anyway.');
    console.warn(error.message || error);
  }

  for (const definition of productDefinitions) {
    if (existingNames.has(definition.name.toLowerCase())) {
      console.log(`Skipping existing product: ${definition.name}`);
      continue;
    }

    try {
      const created = await polar.products.create({
        organizationId: POLAR_ORGANIZATION_ID,
        name: definition.name,
        description: definition.description,
        metadata: definition.metadata,
        recurringInterval: definition.recurringInterval,
        prices: [
          {
            amountType: 'fixed',
            priceAmount: definition.priceAmount,
            priceCurrency: 'usd'
          }
        ]
      });

      console.log(`✅ Created product: ${created.name} (ID: ${created.id})`);
    } catch (error) {
      console.error(`❌ Failed to create product: ${definition.name}`);
      console.error(error.message || error);
    }
  }
})();
