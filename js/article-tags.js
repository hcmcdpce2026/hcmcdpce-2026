(function (root) {
    'use strict';

    const normalize = (value) => String(value || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();

    const STOP_WORDS = new Set((
        'a an à ạ ai ấy ba bạn bằng bị bởi cả các cái cần càng chỉ chính cho chứ chưa có cũng của cùng đã đang đây để đến điều đó được đâu dù gì khi không là lại làm lần lấy lên mà mỗi một mấy nếu những nữa như ở phải qua ra rằng rất rồi sau sẽ so sự tại theo thì trên trong trời từ từng với và vào vậy vì về vẫn và đó'
    ).split(/\s+/).map((word) => word.toLocaleLowerCase('vi')));

    const tokenize = (value) => String(value || '').toLocaleLowerCase('vi').match(/\p{L}+/gu) || [];

    const countPhrases = (words, maxSize) => {
        const counts = new Map();
        for (let size = 1; size <= maxSize && size <= words.length; size++) {
            for (let start = 0; start + size <= words.length; start++) {
                const tokens = words.slice(start, start + size);
                const key = normalize(tokens.join(' '));
                if (tokens.some((token) => STOP_WORDS.has(token))) continue;
                if (size === 1 && key.length < 3) continue;
                const existing = counts.get(key);
                if (existing) existing.count++;
                else counts.set(key, { key, label: tokens.join(' '), count: 1, size });
            }
        }
        return counts;
    };

    const generateArticleTags = (source, limit) => {
        const maximum = Math.max(1, Math.min(8, Number(limit) || 8));
        const titlePhrases = countPhrases(tokenize(source && source.title), 5);
        const excerptPhrases = countPhrases(tokenize(source && source.excerpt), 5);
        const bodyPhrases = countPhrases(tokenize(source && source.body), 5);
        const scores = new Map();
        const addScores = (phrases, weight, onlyWhenInBody, onlyWhenExisting) => {
            phrases.forEach((phrase, key) => {
                if (onlyWhenInBody && !bodyPhrases.has(key)) return;
                if (onlyWhenExisting && !scores.has(key)) return;
                const score = weight * (1 + Math.log(Math.min(phrase.count, 5))) * phrase.size;
                const current = scores.get(key);
                if (current) current.score += score;
                else scores.set(key, { key, label: phrase.label, score });
            });
        };
        addScores(titlePhrases, 6, false);
        addScores(excerptPhrases, 4, true);
        addScores(bodyPhrases, 1, false, true);

        const ranked = Array.from(scores.values()).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
        const selected = [];
        ranked.forEach((candidate) => {
            if (selected.length >= maximum) return;
            const candidateWords = candidate.key.split(' ');
            const overlaps = selected.some((item) => {
                const selectedWords = item.key.split(' ');
                const common = candidateWords.filter((word) => selectedWords.includes(word)).length;
                return common / Math.min(candidateWords.length, selectedWords.length) >= 0.75;
            });
            if (!overlaps) selected.push(candidate);
        });
        return selected.map((item) => item.label);
    };

    const api = { generateArticleTags };
    root.PortalArticleTags = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
