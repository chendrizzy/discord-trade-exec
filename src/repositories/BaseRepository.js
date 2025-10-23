// Internal utilities and services
const { getTenantContext } = require('../middleware/tenantAuth');
const { getEncryptionService } = require('../services/encryption');
const logger = require('../utils/logger');

class BaseRepository {
  constructor(model) {
    this.model = model;
    this.encryptionService = getEncryptionService();
  }

  async findAll(filter = {}, options = {}) {
    try {
      let query = this.model.find(filter);
      if (options.select) query = query.select(options.select);
      if (options.sort) query = query.sort(options.sort);
      if (options.limit) query = query.limit(options.limit);
      if (options.skip) query = query.skip(options.skip);
      if (options.populate) query = query.populate(options.populate);
      return await query.exec();
    } catch (error) {
      logger.error('[BaseRepository] findAll error:', { error: error.message, stack: error.stack });
      throw new Error('Failed to fetch documents');
    }
  }

  async findOne(filter = {}, options = {}) {
    try {
      let query = this.model.findOne(filter);
      if (options.select) query = query.select(options.select);
      if (options.populate) query = query.populate(options.populate);
      return await query.exec();
    } catch (error) {
      logger.error('[BaseRepository] findOne error:', { error: error.message, stack: error.stack });
      throw new Error('Failed to fetch document');
    }
  }

  async findById(id, options = {}) {
    return await this.findOne({ _id: id }, options);
  }

  async create(data) {
    try {
      const document = new this.model(data);
      return await document.save();
    } catch (error) {
      logger.error('[BaseRepository] create error:', { error: error.message, stack: error.stack });
      if (error.code === 11000) {
        throw new Error('Duplicate document. This record already exists.');
      }
      throw new Error('Failed to create document');
    }
  }

  async update(id, updates, options = { new: true }) {
    try {
      const document = await this.findById(id);
      if (!document) return null;
      Object.assign(document, updates);
      await document.save();
      return document;
    } catch (error) {
      logger.error('[BaseRepository] update error:', { error: error.message, stack: error.stack });
      if (error.name === 'TenantIsolationError') throw error;
      throw new Error('Failed to update document');
    }
  }

  async updateMany(filter = {}, updates) {
    try {
      const result = await this.model.updateMany(filter, updates);
      return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
    } catch (error) {
      logger.error('[BaseRepository] updateMany error:', { error: error.message, stack: error.stack });
      throw new Error('Failed to update documents');
    }
  }

  async delete(id) {
    try {
      const document = await this.findById(id);
      if (!document) return null;
      await document.deleteOne();
      return document;
    } catch (error) {
      logger.error('[BaseRepository] delete error:', { error: error.message, stack: error.stack });
      throw new Error('Failed to delete document');
    }
  }

  async deleteMany(filter = {}) {
    try {
      const result = await this.model.deleteMany(filter);
      return { deletedCount: result.deletedCount };
    } catch (error) {
      logger.error('[BaseRepository] deleteMany error:', { error: error.message, stack: error.stack });
      throw new Error('Failed to delete documents');
    }
  }

  async count(filter = {}) {
    try {
      return await this.model.countDocuments(filter);
    } catch (error) {
      logger.error('[BaseRepository] count error:', { error: error.message, stack: error.stack });
      throw new Error('Failed to count documents');
    }
  }

  async exists(filter = {}) {
    try {
      const count = await this.model.countDocuments(filter).limit(1);
      return count > 0;
    } catch (error) {
      logger.error('[BaseRepository] exists error:', { error: error.message, stack: error.stack });
      throw new Error('Failed to check document existence');
    }
  }

  async paginate(filter = {}, page = 1, limit = 10, options = {}) {
    try {
      const skip = (page - 1) * limit;
      const [docs, total] = await Promise.all([this.findAll(filter, { ...options, skip, limit }), this.count(filter)]);
      return { docs, total, page, pages: Math.ceil(total / limit), limit };
    } catch (error) {
      logger.error('[BaseRepository] paginate error:', { error: error.message, stack: error.stack });
      throw new Error('Failed to paginate documents');
    }
  }

  async aggregate(pipeline = []) {
    try {
      return await this.model.aggregate(pipeline).exec();
    } catch (error) {
      logger.error('[BaseRepository] aggregate error:', { error: error.message, stack: error.stack });
      throw new Error('Failed to run aggregation');
    }
  }

  async transaction(callback) {
    const session = await this.model.db.startSession();
    try {
      session.startTransaction();
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      logger.error('[BaseRepository] transaction error:', { error: error.message, stack: error.stack });
      throw error;
    } finally {
      session.endSession();
    }
  }

  async encryptFields(data, fields = []) {
    try {
      const { communityId } = getTenantContext();
      const encrypted = { ...data };
      for (const field of fields) {
        if (data[field]) {
          encrypted[field] = await this.encryptionService.encryptField(communityId, data[field]);
        }
      }
      return encrypted;
    } catch (error) {
      logger.error('[BaseRepository] encryptFields error:', { error: error.message, stack: error.stack });
      throw new Error('Failed to encrypt sensitive fields');
    }
  }

  async decryptFields(data, fields = []) {
    try {
      const { communityId } = getTenantContext();
      const decrypted = { ...data };
      for (const field of fields) {
        if (data[field]) {
          decrypted[field] = await this.encryptionService.decryptField(communityId, data[field]);
        }
      }
      return decrypted;
    } catch (error) {
      logger.error('[BaseRepository] decryptFields error:', { error: error.message, stack: error.stack });
      throw new Error('Failed to decrypt sensitive fields');
    }
  }

  async softDelete(id) {
    return await this.update(id, { deletedAt: new Date() });
  }

  async restore(id) {
    return await this.update(id, { deletedAt: null });
  }

  async bulkCreate(dataArray) {
    try {
      return await this.model.insertMany(dataArray);
    } catch (error) {
      logger.error('[BaseRepository] bulkCreate error:', { error: error.message, stack: error.stack });
      if (error.code === 11000) {
        throw new Error('Duplicate documents. Some records already exist.');
      }
      throw new Error('Failed to create documents in bulk');
    }
  }
}

module.exports = BaseRepository;
