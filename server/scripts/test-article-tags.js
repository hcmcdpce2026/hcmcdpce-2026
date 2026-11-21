'use strict';

const assert = require('node:assert/strict');
const { generateArticleTags } = require('../../js/article-tags');

const tags = generateArticleTags({
  title: 'Phòng, chống ma túy tại Thành phố Hồ Chí Minh',
  excerpt: 'Tăng cường tuyên truyền và hỗ trợ cộng đồng phòng chống ma túy.',
  body: '<p>Chương trình tuyên truyền phòng chống ma túy giúp cộng đồng nhận biết tác hại.</p>',
});

assert(tags.includes('phòng chống ma túy'), 'Should create a topical phrase from the title.');
assert(tags.includes('thành phố hồ chí minh'), 'Should retain meaningful Vietnamese place names.');
assert(tags.some((tag) => tag.includes('tuyên truyền')), 'Should consider the article summary and body.');
assert(tags.length <= 8, 'Should respect the editor tag limit.');
assert(!tags.includes('và'), 'Should exclude common Vietnamese stop words.');

console.log(`Article tag generator: ${tags.length} tags verified.`);
