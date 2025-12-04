// lib/config/index.js
class Config {
  constructor() {
    this.loadEnvironment();
  }

  loadEnvironment() {
    // Default values
    this.config = {
      // Database
      mongodbUri: process.env.MONGODB_URI,
      databaseName: this.getDatabaseName(),
      
      // Auth
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
      
      // App
      nodeEnv: process.env.NODE_ENV || 'development',
      appName: process.env.APP_NAME || 'DairyPro',
      appUrl: process.env.APP_URL,
      isProduction: process.env.NODE_ENV === 'production',
      isDevelopment: process.env.NODE_ENV === 'development',
      isTest: process.env.NODE_ENV === 'test',
      
      // Features
      enableCache: process.env.ENABLE_CACHE === 'true',
      logLevel: process.env.LOG_LEVEL || 'info',
      
      // Security
      allowedOrigins: process.env.ALLOWED_ORIGINS 
        ? process.env.ALLOWED_ORIGINS.split(',') 
        : ['http://localhost:3000'],
    };

    this.validate();
  }

  getDatabaseName() {
    if (this.isTest) return 'test_dairypro';
    if (this.isDevelopment) return 'production_dev';
    return 'production_prod';
  }

  validate() {
    const required = ['mongodbUri', 'jwtSecret'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  get(key) {
    return this.config[key];
  }

  getAll() {
    return { ...this.config };
  }
}

// Singleton instance
const config = new Config();
export default config;