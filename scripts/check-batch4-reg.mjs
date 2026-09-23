import { NATIONAL_COMEDY_VENUES } from '../lib/comedy/national-registry.js';
console.log('buffalo:', NATIONAL_COMEDY_VENUES.some(v => v.slug.includes('buffalo')));
console.log('goodnights:', NATIONAL_COMEDY_VENUES.some(v => v.slug.includes('goodnights')));
console.log('stress:', NATIONAL_COMEDY_VENUES.some(v => v.slug.includes('stress')));
console.log('laugh-boston:', NATIONAL_COMEDY_VENUES.some(v => v.slug === 'laugh-boston'));
