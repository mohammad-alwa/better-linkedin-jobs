const SELECTORS = {
    jobTitle: '.job-details-jobs-unified-top-card__job-title',
    companyName: '.job-details-jobs-unified-top-card__company-name',
    jobDescription: '#job-details',
    jobCard: '.job-card-container',
    jobCardFooter: '.job-card-list__footer-wrapper',
};

const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Function to check if we're on the job search page
const isJobSearchPage = () => window.location.href.includes('/jobs/search/');

// Function to extract job ID from URL
const extractJobId = () => {
    // Try to extract from job details page URL: https://www.linkedin.com/jobs/view/{jobId}
    const viewMatch = window.location.href.match(/\/jobs\/view\/(\d+)/);
    if (viewMatch?.[1]) {
        return viewMatch[1];
    }

    // Try to extract from job search page URL: https://www.linkedin.com/jobs/search/?currentJobId={jobId}
    const searchParams = new URLSearchParams(window.location.search);
    const currentJobId = searchParams.get('currentJobId');
    if (currentJobId) {
        return currentJobId;
    }

    return null;
}

// Function to extract job title from LinkedIn (details and search panel)
const extractJobTitle = () => {
    const titleElement = document.querySelector(SELECTORS.jobTitle);
    return titleElement?.textContent.trim() ?? null;
};

// Function to extract company name from LinkedIn (details and search panel)
const extractCompanyName = () => {
    const companyElement = document.querySelector(SELECTORS.companyName);
    return companyElement?.textContent.trim() ?? null;
};

// Function to extract job description from LinkedIn (details and search panel)
const extractJobDescription = () => {
    const descriptionElement = document.querySelector(SELECTORS.jobDescription);
    return descriptionElement?.textContent.trim() ?? null;
};

// Function to append titles to the analysis result
const titleAnalysisResult = (analysis) => {
    return [
        { title: 'Job Language', value: analysis.language },
        { title: 'Role', value: analysis.scope },
        { title: 'Programming Language', value: analysis.programming },
        { title: 'Experience Level', value: analysis.experience }]
        ;
}