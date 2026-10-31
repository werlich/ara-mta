import {randomBytes,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
export async function hashPassword(password){const salt=randomBytes(16).toString('hex'); return {salt,hash:(await scrypt(password,salt,64)).toString('hex')};}
export async function verifyPassword(password,record){if(!record)return false;const actual=await scrypt(password,record.salt,64); const expected=Buffer.from(record.hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export const today=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false; const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
export function allowed(user,now=new Date()){return !!user&&user.active&&(user.role==='admin'||(validDate(user.expiresOn)&&today(now)<=user.expiresOn));}
