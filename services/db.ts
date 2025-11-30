import Dexie, { Table } from 'dexie';
import { Report } from '../types';

class PWADataBase extends Dexie {
  reports!: Table<Report, number>;

  constructor() {
    super('PlataformaCampecheDB');
    // Using 'as any' to bypass TypeScript error where 'version' is not found on the type
    (this as any).version(1).stores({
      reports: '++id, timestamp, synced, municipio' // Primary key and indexed props
    });
  }
}

export const db = new PWADataBase();