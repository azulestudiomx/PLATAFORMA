import Dexie, { Table } from 'dexie';
import { Report } from '../types';

class PWADataBase extends Dexie {
  reports!: Table<Report, number>;
  people!: Table<any, number>;

  constructor() {
    super('PlataformaCampecheDB');
    // Using 'as any' to bypass TypeScript error where 'version' is not found on the type
    (this as any).version(3).stores({
      reports: '++id, timestamp, synced, municipio',
      people: '++id, _id, name, ine, synced, municipio, localidad, distrito, zona, seccion'
    });

  }
}

export const db = new PWADataBase();