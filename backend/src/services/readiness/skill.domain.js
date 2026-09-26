/**
 * Skill Domain Taxonomy and Normalization
 */

const SKILL_DOMAINS = {
    'Programming': ['javascript', 'python', 'java', 'c++', 'c#', 'ruby', 'go', 'typescript', 'swift', 'kotlin'],
    'Web Development': ['web development', 'html', 'css', 'react', 'node.js', 'express.js', 'angular', 'vue', 'django', 'flask', 'spring boot', 'html5', 'css3'],
    'Artificial Intelligence': ['machine learning'],
    'DBMS': ['database/sql', 'sql', 'mongodb', 'mysql', 'postgresql', 'oracle', 'redis', 'firebase', 'cassandra'],
    'Development Tools': ['version control (git)', 'git', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'jenkins', 'linux', 'bash'],
    'DSA': ['dsa', 'algorithms', 'problem solving', 'competitive programming'],
    'Operating Systems': ['linux', 'unix', 'windows server', 'shell scripting'],
    'Computer Networks': ['tcp/ip', 'dns', 'http', 'networking']
};

// Aliases for normalization
const ALIASES = {
    'ml': 'machine learning',
    'dsa solving': 'dsa',
    'data structures and algorithms': 'dsa',
    'data structure and algorithms': 'dsa',
    'data structures': 'dsa',
    'webdev': 'web development',
    'web dev': 'web development',
    'js': 'javascript',
    'node': 'node.js',
    'express': 'express.js',
    'cpp': 'c++',
    'cplusplus': 'c++',
    'reactjs': 'react',
    'aws': 'aws',
    'amazon web services': 'aws',
    'google cloud': 'gcp',
    'dsa': 'data structures',
    'git': 'version control (git)',
    'github': 'version control (git)',
    'sql': 'database/sql',
    'mysql': 'database/sql',
    'postgresql': 'database/sql',
    'mongodb': 'database/sql'
};

const LEVEL_SCORES = {
    'beginner': 40,
    'intermediate': 70,
    'advanced': 90
};

/**
 * Normalizes a skill name
 */
function normalizeSkill(skillName) {
    if (!skillName) return '';
    let name = skillName.toLowerCase().trim();
    if (ALIASES[name]) {
        return ALIASES[name];
    }
    return name;
}

/**
 * Maps a skill to its domain(s)
 */
function getDomainsForSkill(normalizedSkill) {
    const domains = [];
    for (const [domain, skills] of Object.entries(SKILL_DOMAINS)) {
        if (skills.includes(normalizedSkill)) {
            domains.push(domain);
        }
    }
    return domains.length ? domains : ['Other'];
}

/**
 * Calculates the Technical Skills Score based on Domain Coverage and Levels
 */
function calculateTechnicalSkillsScore(studentSkills) {
    if (!studentSkills || studentSkills.length === 0) return 0;

    const domainCoverage = {};
    const domainScores = {};

    // Group skills by domain and calculate coverage
    for (const skill of studentSkills) {
        const normName = normalizeSkill(skill.name);
        const domains = getDomainsForSkill(normName);
        const levelScore = LEVEL_SCORES[skill.level?.toLowerCase()] || 70; // Default to intermediate

        for (const domain of domains) {
            if (domain === 'Other') continue;

            if (!domainCoverage[domain]) {
                domainCoverage[domain] = { recognized: 0, totalScore: 0 };
            }
            // Avoid double counting same skill in a domain
            domainCoverage[domain].recognized += 1;
            domainCoverage[domain].totalScore += levelScore;
        }
    }

    let totalDomainScore = 0;
    let domainCount = 0;

    for (const [domain, data] of Object.entries(domainCoverage)) {
        const totalConfigured = SKILL_DOMAINS[domain].length;
        // Limit coverage to 100% just in case
        const coverage = Math.min((data.recognized / totalConfigured) * 100, 100);
        // Average skill level in this domain
        const avgLevel = data.totalScore / data.recognized;

        const domainScore = (coverage * 0.70) + (avgLevel * 0.30);
        totalDomainScore += domainScore;
        domainCount++;
    }

    if (domainCount === 0) {
        // Fallback if all skills are "Other"
        const avgLevel = studentSkills.reduce((acc, s) => acc + (LEVEL_SCORES[s.level?.toLowerCase()] || 70), 0) / studentSkills.length;
        return avgLevel;
    }

    return Math.min(totalDomainScore / domainCount, 100);
}

module.exports = {
    SKILL_DOMAINS,
    normalizeSkill,
    getDomainsForSkill,
    calculateTechnicalSkillsScore
};
