const { registerModel, getActiveConnection } = require('./connectionManager');

function normalizeArgs(args) {
  return Array.isArray(args) ? args : [args];
}

function ensureModel(name, schema) {
  const models = registerModel(name, schema);
  const active = getActiveConnection();
  
  // If no active connection, return null (will be handled by proxy)
  if (!active) {
    return null;
  }

  // Check if model is already registered on active connection
  if (active.models && active.models[name]) {
    return active.models[name];
  }

  // Try to get model from registered models
  if (models) {
    // Check which connection is active and return corresponding model
    const { getCloudConnection, getLocalConnection, isCloudOnline } = require('./connectionManager');
    const cloudConn = getCloudConnection();
    const localConn = getLocalConnection();
    
    // If cloud is online and active, use cloud model
    if (isCloudOnline() && active === cloudConn && models.cloud) {
      return models.cloud;
    }
    // Otherwise use local model if available
    if (active === localConn && models.local) {
      return models.local;
    }
    // Fallback: return whichever is available
    const target = models.cloud || models.local;
    if (target) {
      return target;
    }
  }

  // If we have an active connection but no model, this is an error
  throw new Error(`Model ${name} is not registered on the active connection. Connection may not be ready yet.`);
}

function createModelProxy(name, schema) {
  const proxyTarget = function proxyCallable(...args) {
    const model = ensureModel(name, schema);
    if (!model) {
      throw new Error('No database connection available');
    }
    return model.apply(model, normalizeArgs(args));
  };

  return new Proxy(
    proxyTarget,
    {
      get(_, prop) {
        if (prop === '__schema') return schema;
        if (prop === '__modelName') return name;

        const model = ensureModel(name, schema);
        if (!model) {
          throw new Error('No database connection available');
        }
        if (prop === 'prototype') {
          return model.prototype;
        }
        const value = model[prop];
        if (typeof value === 'function') {
          return (...args) => value.apply(model, normalizeArgs(args));
        }
        return value;
      },
      construct(_, args) {
        const model = ensureModel(name, schema);
        return new model(...args);
      },
      apply(_, thisArg, args) {
        const model = ensureModel(name, schema);
        return model.apply(thisArg, normalizeArgs(args));
      },
    }
  );
}

module.exports = {
  createModelProxy,
  ensureModel,
};

