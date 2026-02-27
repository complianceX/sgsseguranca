import { Injectable, Logger } from '@nestjs/common';
import * as geoip from 'geoip-lite';

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  ll: [number, number]; // Latitude, Longitude
}

@Injectable()
export class GeoIpService {
  private readonly logger = new Logger(GeoIpService.name);

  getLocation(ip: string): GeoLocation | null {
    try {
      // Handle local addresses
      if (ip === '::1' || ip === '127.0.0.1') {
        return {
          country: 'BR', // Default to Brazil for local dev
          region: 'SP',
          city: 'São Paulo',
          ll: [-23.5505, -46.6333],
        };
      }

      const geo = geoip.lookup(ip);
      if (!geo) return null;

      return {
        country: geo.country,
        region: geo.region,
        city: geo.city,
        ll: geo.ll,
      };
    } catch (error) {
      this.logger.error(`Error looking up IP ${ip}: ${error.message}`);
      return null;
    }
  }

  isSuspiciousLocation(current: GeoLocation, history: GeoLocation[]): boolean {
    // If no history, assume safe (first login)
    if (!history || history.length === 0) return false;

    // Check if country changed
    const lastLocation = history[history.length - 1];
    if (current.country !== lastLocation.country) {
      return true;
    }

    // Check if region (state) changed
    if (current.region !== lastLocation.region) {
      return true; // Flag as suspicious if state changed
    }

    return false;
  }
}
