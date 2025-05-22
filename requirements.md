# Better LinkedIn Jobs

Better LinkedIn Jobs (BLJ) is a Chrome extension that enhances the job search experience using Gemini AI (gemini-2.0-flash). It does so by providing job analysis and modifying the underlying DOM docuemnt to display the analysis result.

## Flow
### Set Up
BLJ requires a gemini API key to function, the user needs to input the key in the extension. BLJ will validate and store the API key securely in the extension storage.
Users can remove or change their API keys later.

### Analysis
- BLJ can perform analysis on both the jobs search and job pages.
- BLJ will display an Analyze button under the Job title
    - Job title HTML element has the class `job-details-jobs-unified-top-card__job-title`
- BLJ will make sure the DOM is loaded in order to append the Analyze button
- When a user clicks on the Analyze button, BLJ will extract:
    - Job Title ${jobTitle}
    - Company Name ${companyName}
    - Job Description ${jd}
- After extraction, BLJ will request structured output using json response schema from "gemini-2.0-flash"
    - Prompt:
        ```
        Analyze the following job description and provide answers to the questions below:

        Job Title: ${jobTitle}
        Company: ${companyName}

        Job Description:
        ${jd}

        Questions
        language: what's the language of the JD
        scope: Is it for Backend, Frontend, Fullstack, Manager, AI, DevOps or Other. If other be more specific in 3 words at most. You can add two scopes at most. Better to have one scope.
        programming: what's the main programming language required?
        experience: what's the experience level required? Add years of experience if mentioned.
        ```
    - Response example:
        ```
        {
            "language": "English",
            "scope": "Backend",
            "programming": "Java",
            "experience": "3-5 years"
        }
        ```
- BLJ will display the analysis result inplace of the Analyze button.

### UI/UX
- BLJ will use style similar to LinkedIn for both the settings popup, analysis button and the analysis result.
- BLJ will follow best practicies in UI/UX to create modern design, it will utlize css without any external dependecy.
- In the jobs search page, when a user switches between jobs. The analysis result must be reset.