import ExternalAPI from '@server/api/externalapi';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import crypto from 'crypto';
import { parseStringPromise } from 'xml2js';

// MD5_CRYPT implementation based on FreeBSD md5crypt
const MAGIC = '$1$';
const ITOA64 = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function to64(v: number, n: number): string {
  let ret = '';
  let value = v;
  let count = n;
  
  while (count - 1 >= 0) {
    count = count - 1;
    ret = ret + ITOA64[value & 0x3f];
    value = value >> 6;
  }
  return ret;
}

function unixMd5Crypt(pw: string, salt: string, magic: string = MAGIC): string {
  const pwBuf = Buffer.from(pw, 'utf-8');
  let saltBuf = Buffer.from(salt, 'utf-8');
  const magicBuf = Buffer.from(magic, 'utf-8');

  if (saltBuf.subarray(0, magicBuf.length).equals(magicBuf)) {
    saltBuf = saltBuf.subarray(magicBuf.length);
  }

  const saltStr = saltBuf.toString('utf-8').split('$')[0];
  saltBuf = Buffer.from(saltStr.substring(0, 8), 'utf-8');

  let ctx = Buffer.concat([pwBuf, magicBuf, saltBuf]);
  let final = crypto.createHash('md5').update(Buffer.concat([pwBuf, saltBuf, pwBuf])).digest();

  for (let pl = pwBuf.length; pl > 0; pl -= 16) {
    if (pl > 16) {
      ctx = Buffer.concat([ctx, final.subarray(0, 16)]);
    } else {
      ctx = Buffer.concat([ctx, final.subarray(0, pl)]);
    }
  }

  let i = pwBuf.length;
  while (i) {
    if (i & 1) {
      ctx = Buffer.concat([ctx, Buffer.from([0x00])]);
    } else {
      ctx = Buffer.concat([ctx, pwBuf.subarray(0, 1)]);
    }
    i = i >> 1;
  }

  final = crypto.createHash('md5').update(ctx).digest();

  for (let iter = 0; iter < 1000; iter++) {
    let ctx1 = Buffer.alloc(0);

    if (iter & 1) {
      ctx1 = Buffer.concat([ctx1, pwBuf]);
    } else {
      ctx1 = Buffer.concat([ctx1, final.subarray(0, 16)]);
    }

    if (iter % 3) {
      ctx1 = Buffer.concat([ctx1, saltBuf]);
    }

    if (iter % 7) {
      ctx1 = Buffer.concat([ctx1, pwBuf]);
    }

    if (iter & 1) {
      ctx1 = Buffer.concat([ctx1, final.subarray(0, 16)]);
    } else {
      ctx1 = Buffer.concat([ctx1, pwBuf]);
    }

    final = crypto.createHash('md5').update(ctx1).digest();
  }

  let passwd = '';
  passwd += to64((final[0] << 16) | (final[6] << 8) | final[12], 4);
  passwd += to64((final[1] << 16) | (final[7] << 8) | final[13], 4);
  passwd += to64((final[2] << 16) | (final[8] << 8) | final[14], 4);
  passwd += to64((final[3] << 16) | (final[9] << 8) | final[15], 4);
  passwd += to64((final[4] << 16) | (final[10] << 8) | final[5], 4);
  passwd += to64(final[11], 2);

  return magic + saltBuf.toString('utf-8') + '$' + passwd;
}

export interface WebShareSaltResponse {
  response: {
    status: string[];
    salt?: string[];
  };
}

export interface WebShareLoginResponse {
  response: {
    status: string[];
    token?: string[];
  };
}

export interface WebShareSearchResponse {
  response: {
    status: string[];
    total?: string[];
    file?: {
      ident: string[];
      name: string[];
      size: string[];
      type: string[];
      positive_votes: string[];
      negative_votes: string[];
      password: string[];
    }[];
  };
}

export interface WebShareFileLinkResponse {
  response: {
    status: string[];
    link?: string[];
    name?: string[];
  };
}

export interface WebShareSearchOptions {
  query: string;
  sort?: 'largest' | 'smallest' | 'newest' | 'oldest';
  limit?: number;
}

export interface WebShareFileResult {
  ident: string;
  name: string;
  size: number;
  positive_votes: number;
  negative_votes: number;
  password_protected: boolean;
}

class WebShareAPI extends ExternalAPI {
  private username: string;
  private password: string;
  private token?: string;
  private tokenExpiry?: Date;

  constructor(username?: string, password?: string) {
    super(
      'https://webshare.cz/api',
      {},
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'text/xml',
        },
        rateLimit: {
          maxRequests: 10,
          maxRPS: 5,
        },
      }
    );

    const settings = getSettings();
    this.username = username || settings.webshare.username || '';
    this.password = password || settings.webshare.password || '';
  }

  private async getSalt(): Promise<string> {
    if (!this.username) {
      throw new Error('WebShare username not configured');
    }

    logger.debug('Getting salt for WebShare user', { 
      label: 'WebShare', 
      username: this.username 
    });

    const response = await this.axios.post<string>(
      '/salt/',
      `username_or_email=${encodeURIComponent(this.username)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const saltResult: WebShareSaltResponse = await parseStringPromise(response.data);
    
    if (saltResult.response.status[0] !== 'OK' || !saltResult.response.salt) {
      throw new Error('Failed to get salt from WebShare.cz');
    }

    return saltResult.response.salt[0];
  }

  private async authenticate(): Promise<string> {
    if (!this.username || !this.password) {
      throw new Error('WebShare credentials not configured');
    }

    // Check if we have a valid token
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.token;
    }

    logger.debug('Authenticating with WebShare.cz', { 
      label: 'WebShare', 
      username: this.username 
    });

    const salt = await this.getSalt();
    
    // Create password hash: SHA1(MD5_CRYPT(password))
    const md5CryptResult = unixMd5Crypt(this.password, salt);
    const passwordHash = crypto.createHash('sha1').update(md5CryptResult).digest('hex');

    const response = await this.axios.post<string>(
      '/login/',
      `username_or_email=${encodeURIComponent(this.username)}&password=${passwordHash}&keep_logged_in=1`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const loginResult: WebShareLoginResponse = await parseStringPromise(response.data);
    
    if (loginResult.response.status[0] !== 'OK' || !loginResult.response.token) {
      throw new Error('Authentication failed');
    }

    this.token = loginResult.response.token[0];
    // Set token expiry to 1 hour from now
    this.tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    logger.info('Successfully authenticated with WebShare.cz', { 
      label: 'WebShare', 
      username: this.username 
    });

    return this.token;
  }

  public async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch (error) {
      logger.error('WebShare connection test failed', {
        label: 'WebShare',
        error: error.message,
      });
      return false;
    }
  }

  public async searchFiles(options: WebShareSearchOptions): Promise<WebShareFileResult[]> {
    const token = await this.authenticate();
    
    logger.debug('Searching WebShare files', { 
      label: 'WebShare', 
      query: options.query,
      sort: options.sort || 'largest',
      limit: options.limit || 50 
    });

    const response = await this.axios.post<string>(
      '/search/',
      `wst=${token}&what=${encodeURIComponent(options.query)}&sort=${options.sort || 'largest'}&limit=${options.limit || 50}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const searchResult: WebShareSearchResponse = await parseStringPromise(response.data);
    
    if (searchResult.response.status[0] !== 'OK') {
      throw new Error('Search failed');
    }

    const files = searchResult.response.file || [];
    return files.map((file) => ({
      ident: file.ident[0],
      name: file.name[0],
      size: parseInt(file.size[0]),
      positive_votes: parseInt(file.positive_votes[0]),
      negative_votes: parseInt(file.negative_votes[0]),
      password_protected: file.password[0] === '1',
    }));
  }

  public async getFileLink(ident: string): Promise<{ url: string; name: string }> {
    const token = await this.authenticate();
    
    logger.debug('Getting WebShare file link', { 
      label: 'WebShare', 
      ident 
    });

    const response = await this.axios.post<string>(
      '/file_link/',
      `wst=${token}&ident=${ident}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const linkResult: WebShareFileLinkResponse = await parseStringPromise(response.data);
    
    if (linkResult.response.status[0] !== 'OK' || !linkResult.response.link) {
      throw new Error('Failed to get download link');
    }

    return {
      url: linkResult.response.link[0],
      name: linkResult.response.name?.[0] || 'unknown',
    };
  }
}

export default WebShareAPI;
