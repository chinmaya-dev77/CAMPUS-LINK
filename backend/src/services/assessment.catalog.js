const TECHNICAL_QUESTIONS = [
    {
        id: 'programming-fundamentals', category: 'Programming', prompt: 'What is the main benefit of encapsulation in object-oriented programming?',
        options: ['It hides internal state behind a clear interface', 'It makes every variable globally accessible', 'It removes the need for testing', 'It guarantees faster execution'], correctIndex: 0
    },
    {
        id: 'data-structures', category: 'DSA', prompt: 'Which data structure is best suited for checking whether a value has appeared before, on average in constant time?',
        options: ['Queue', 'Hash set', 'Binary heap', 'Linked list'], correctIndex: 1
    },
    {
        id: 'dbms-normalization', category: 'DBMS', prompt: 'What is a primary purpose of database normalization?',
        options: ['Increase duplicate data', 'Reduce update anomalies and unnecessary duplication', 'Encrypt every table automatically', 'Replace all indexes'], correctIndex: 1
    },
    {
        id: 'oop-polymorphism', category: 'OOP', prompt: 'Which statement best describes polymorphism?',
        options: ['A single interface can support different implementations', 'A class can only have one method', 'Objects cannot inherit behavior', 'Data is stored in alphabetical order'], correctIndex: 0
    },
    {
        id: 'operating-systems', category: 'Operating Systems', prompt: 'What does a context switch allow an operating system to do?',
        options: ['Move a file into a database', 'Pause one process and resume another', 'Compile source code', 'Increase physical memory'], correctIndex: 1
    },
    {
        id: 'computer-networks', category: 'Computer Networks', prompt: 'Which protocol provides reliable, ordered delivery of data between applications?',
        options: ['UDP', 'IP', 'TCP', 'ARP'], correctIndex: 2
    },
    {
        id: 'web-development', category: 'Web Development', prompt: 'Why should a web application validate input on the server even if it also validates in the browser?',
        options: ['Browsers cannot send strings', 'Client-side checks can be bypassed', 'Server validation makes HTTPS unnecessary', 'It prevents every network delay'], correctIndex: 1
    }
];

const APTITUDE_QUESTIONS = [
    {
        id: 'aptitude-ratio', category: 'Aptitude', prompt: 'A team completes 3 tasks in 6 hours at a steady rate. How long would it take to complete 5 tasks at that rate?',
        options: ['8 hours', '10 hours', '12 hours', '15 hours'], correctIndex: 1
    },
    {
        id: 'aptitude-sequence', category: 'Aptitude', prompt: 'What number comes next in the sequence: 4, 7, 13, 25, …?',
        options: ['37', '43', '49', '51'], correctIndex: 2
    },
    {
        id: 'aptitude-logic', category: 'Aptitude', prompt: 'All analysts use data. Mira is an analyst. Which conclusion follows?',
        options: ['Mira uses data', 'Everyone who uses data is an analyst', 'Mira manages every dataset', 'No conclusion can be made'], correctIndex: 0
    }
];

const PROGRAMMING_VARIANTS = [
    {
        id: 'programming-python', category: 'Programming', prompt: 'In Python, what is the average lookup time for a key in a dictionary?',
        options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], correctIndex: 0, skill: 'python'
    },
    {
        id: 'programming-java', category: 'Programming', prompt: 'In Java, what does method overriding allow a subclass to do?',
        options: ['Provide its own implementation of an inherited method', 'Change a local variable in another method', 'Create multiple public classes in one file', 'Make every method static'], correctIndex: 0, skill: 'java'
    },
    {
        id: 'programming-javascript', category: 'Programming', prompt: 'In JavaScript, what does a Promise represent?',
        options: ['A value that may be available now, later, or never', 'A synchronous loop', 'A DOM element', 'A database table'], correctIndex: 0, skill: 'javascript'
    }
];

const ALL_QUESTIONS = [...TECHNICAL_QUESTIONS, ...PROGRAMMING_VARIANTS, ...APTITUDE_QUESTIONS];

function selectQuestions(student = {}) {
    const skillNames = (student.skills || []).map((skill) => String(skill?.name || '').toLowerCase());
    const matchedLanguage = PROGRAMMING_VARIANTS.find((variant) => skillNames.some((skill) => skill.includes(variant.skill)));
    const technical = TECHNICAL_QUESTIONS.map((question) => question.id === 'programming-fundamentals' && matchedLanguage ? matchedLanguage : question);
    return [...technical, ...APTITUDE_QUESTIONS];
}

function publicQuestion(question) {
    return { id: question.id, category: question.category, prompt: question.prompt, options: [...question.options] };
}

function getQuestion(id) {
    return ALL_QUESTIONS.find((question) => question.id === id) || null;
}

module.exports = { TECHNICAL_QUESTIONS, APTITUDE_QUESTIONS, PROGRAMMING_VARIANTS, selectQuestions, publicQuestion, getQuestion };
