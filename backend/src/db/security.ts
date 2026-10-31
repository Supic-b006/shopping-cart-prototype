import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export function passwordHash(password: string): string {
 const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;
}
export function passwordMatches(password: string, hash: string): boolean {
 const [salt,hex] = hash.split(':'); const expected = Buffer.from(hex,'hex');
 const actual = scryptSync(password,salt,64); return expected.length === actual.length && timingSafeEqual(expected,actual);
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
