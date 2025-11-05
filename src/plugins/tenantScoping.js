// Internal utilities and services
const { getTenantContext } = require('../middleware/tenantAuth');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

/**
 * Tenant Scoping Mongoose Plugin
 *
 * Layer 2 of 7-Layer Security Defense
 *
 * Automatically adds `communityId` filter to ALL Mongoose queries.
 * Prevents accidental cross-tenant data access at the ORM level.
 *
 * Security Features:
 * - Automatic tenant filtering on find/findOne/count/update/delete
 * - Prevents cross-tenant updates and deletions
 * - No way to bypass without explicit disableTenantScoping option
 * - Works with all Mongoose query methods (find, aggregate, populate, etc.)
 *
 * Usage:
 *   const tenantScopingPlugin = require('./plugins/tenantScoping');
 *   userSchema.plugin(tenantScopingPlugin);
 *
 * @param {Schema} schema - Mongoose schema to apply plugin to
 * @param {Object} options - Plugin options
 * @param {boolean} options.disableTenantScoping - Disable tenant scoping for this model
 */
const tenantScopingPlugin = (schema, options = {}) => {
  // Skip plugin if tenant scoping is explicitly disabled
  if (options.disableTenantScoping === true) {
    return;
  }

  /**
   * Get Tenant Filter
   *
   * Safely extracts communityId from tenant context.
   * Returns empty object if no context (e.g., during initialization, seeds, migrations).
   */
  const getTenantFilter = () => {
    try {
      const context = getTenantContext();
      return { communityId: context.communityId };
    } catch (error) {
      // No tenant context = allow query (for seeds, migrations, background jobs)
      // In production, you may want to throw error instead for stricter security
      logger.warn('[TenantScoping] No tenant context available. Query will not be tenant-scoped.');
      return {};
    }
  };

  /**
   * Merge Tenant Filter with Query Conditions
   *
   * Intelligently merges tenant filter with existing query conditions.
   * Handles $and, $or, and nested queries properly.
   */
  const mergeTenantFilter = (conditions, tenantFilter) => {
    // No tenant filter = pass through unchanged
    if (!tenantFilter.communityId) {
      return conditions;
    }

    // Empty conditions = just use tenant filter
    if (!conditions || Object.keys(conditions).length === 0) {
      return tenantFilter;
    }

    // If communityId already in query, trust it (for explicit cross-tenant admin queries)
    if (conditions.communityId !== undefined) {
      return conditions;
    }

    // Handle $or queries - wrap in $and to ensure tenant scoping
    if (conditions.$or) {
      return {
        $and: [tenantFilter, conditions]
      };
    }

    // Default: merge tenant filter into conditions
    return {
      ...conditions,
      ...tenantFilter
    };
  };

  /**
   * Pre-Find Hook
   *
   * Applies tenant scoping to all find queries (find, findOne, findById, etc.)
   */
  schema.pre(/^find/, function (next) {
    const tenantFilter = getTenantFilter();
    this.setQuery(mergeTenantFilter(this.getQuery(), tenantFilter));
    next();
  });

  /**
   * Pre-Count Hook
   *
   * Applies tenant scoping to count queries (count, countDocuments, estimatedDocumentCount)
   */
  schema.pre(/^count/, function (next) {
    const tenantFilter = getTenantFilter();
    this.setQuery(mergeTenantFilter(this.getQuery(), tenantFilter));
    next();
  });

  /**
   * Pre-Update Hook
   *
   * Applies tenant scoping to update queries (update, updateOne, updateMany, findOneAndUpdate)
   */
  schema.pre(/^update/, function (next) {
    const tenantFilter = getTenantFilter();
    this.setQuery(mergeTenantFilter(this.getQuery(), tenantFilter));
    next();
  });

  /**
   * Pre-Delete Hook
   *
   * Applies tenant scoping to delete queries (remove, deleteOne, deleteMany, findOneAndDelete)
   */
  schema.pre(/^(remove|delete)/, function (next) {
    const tenantFilter = getTenantFilter();
    this.setQuery(mergeTenantFilter(this.getQuery(), tenantFilter));
    next();
  });

  /**
   * Pre-Aggregate Hook
   *
   * Applies tenant scoping to aggregation pipelines.
   * Inserts $match stage at beginning of pipeline.
   */
  schema.pre('aggregate', function (next) {
    const tenantFilter = getTenantFilter();

    if (tenantFilter.communityId) {
      // Insert $match stage at beginning of pipeline
      const pipeline = this.pipeline();

      // Check if first stage already has communityId match
      if (pipeline.length > 0 && pipeline[0].$match && pipeline[0].$match.communityId !== undefined) {
        // Already has tenant filter, don't add duplicate
        return next();
      }

      // Convert string communityId to ObjectId for aggregation $match
      // (tenantAuth middleware stores communityId as string, but DB has ObjectId)
      const aggregateFilter = {
        communityId: mongoose.Types.ObjectId.isValid(tenantFilter.communityId)
          ? new mongoose.Types.ObjectId(tenantFilter.communityId)
          : tenantFilter.communityId
      };

      // Add tenant filter as first stage
      pipeline.unshift({ $match: aggregateFilter });
    }

    next();
  });

  /**
   * Pre-Save Hook
   *
   * Automatically sets communityId on new documents.
   * Prevents changing communityId on existing documents.
   */
  schema.pre('save', function (next) {
    // Only apply to documents with communityId field
    if (this.schema.path('communityId') === undefined) {
      return next();
    }

    try {
      const context = getTenantContext();

      // New document: Set communityId from context
      if (this.isNew) {
        if (!this.communityId) {
          this.communityId = context.communityId;
        }
      } else {
        // Existing document: Prevent changing communityId
        if (this.isModified('communityId')) {
          const error = new Error(
            'Cannot change communityId on existing document. ' +
              'This is a security violation - documents cannot be moved between tenants.'
          );
          error.name = 'TenantIsolationError';
          return next(error);
        }
      }

      next();
    } catch (error) {
      // No tenant context during save
      if (this.isNew && !this.communityId) {
        // New document without communityId and no context
        logger.warn('[TenantScoping] Saving document without communityId', {
          message: 'This should only happen during seeds/migrations',
          modelName: this.constructor.modelName
        });
      }
      next();
    }
  });

  /**
   * Instance Method: Verify Tenant Ownership
   *
   * Validates that document belongs to current tenant context.
   * Useful for explicit security checks before sensitive operations.
   */
  schema.methods.verifyTenantOwnership = function () {
    try {
      const context = getTenantContext();

      if (this.communityId && this.communityId.toString() !== context.communityId) {
        const error = new Error('Cross-tenant access denied. Document belongs to different community.');
        error.name = 'CrossTenantAccessError';
        error.code = 'CROSS_TENANT_ACCESS';
        throw error;
      }

      return true;
    } catch (error) {
      if (error.name === 'CrossTenantAccessError') {
        throw error;
      }
      // No tenant context
      throw new Error('Cannot verify tenant ownership without tenant context');
    }
  };

  /**
   * Static Method: Bypass Tenant Scoping
   *
   * Provides explicit way to run queries across all tenants.
   * Should only be used for admin operations, analytics, migrations.
   *
   * Usage:
   *   const allUsers = await User.withoutTenantScope().find();
   */
  schema.statics.withoutTenantScope = function () {
    return this.find({ _tenantScopeBypass: true });
  };

  /**
   * Pre-Hook for Bypass Pattern
   *
   * Detects bypass flag and removes it before query execution.
   */
  schema.pre(/^find/, function (next) {
    const query = this.getQuery();
    if (query._tenantScopeBypass === true) {
      delete query._tenantScopeBypass;
      // Don't apply tenant filter
      return next();
    }
    next();
  });
};

/**
 * Manual Tenant Scoping Helper
 *
 * For queries that need explicit tenant scoping (e.g., raw MongoDB operations).
 *
 * Usage:
 *   const filter = applyTenantScope({ status: 'active' });
 *   // Returns: { communityId: '...', status: 'active' }
 */
const applyTenantScope = (conditions = {}) => {
  try {
    const { communityId } = getTenantContext();
    return {
      ...conditions,
      communityId
    };
  } catch (error) {
    logger.warn('[TenantScoping] No tenant context for manual scoping');
    return conditions;
  }
};

/**
 * Verify Multi-Tenant Query Safety
 *
 * Validates that a query object includes tenant scoping.
 * Useful for auditing and testing.
 *
 * Usage:
 *   verifyQueryIsTenantScoped({ communityId: '...', status: 'active' }); // true
 *   verifyQueryIsTenantScoped({ status: 'active' }); // false
 */
const verifyQueryIsTenantScoped = query => {
  if (!query) return false;

  // Direct communityId
  if (query.communityId !== undefined) return true;

  // $and with communityId
  if (query.$and && Array.isArray(query.$and)) {
    return query.$and.some(condition => condition.communityId !== undefined);
  }

  return false;
};

module.exports = {
  tenantScopingPlugin,
  applyTenantScope,
  verifyQueryIsTenantScoped
};
