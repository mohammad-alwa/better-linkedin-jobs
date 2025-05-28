# Better LinkedIn Jobs

Better LinkedIn Jobs (BLJ) is a Chrome extension that enhances the job search experience using Gemini AI (gemini-2.0-flash). It does so by providing job analysis and modifying the underlying DOM docuemnt to display the analysis result.

## Flow

### Set Up

BLJ requires a gemini API key to function, the user needs to input the key in the extension. BLJ will validate and store the API key securely in the extension storage.
Users can remove or change their API keys later.
If the API key is present, there will be a checkbox for "Auto Analysis", disabled by default.

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
- BLJ will display the analysis result inplace of the Analyze button.
- BLJ caches the analysis results per job ID to improve the performance and reduce unnecessary API calls, the cache is implemented in-memory for performance and backed by the extension local storage asynchronously for durability.
  - Job ID can be identified as a query parameter in the job search page `https://www.linkedin.com/jobs/search/?currentJobId={jobId}` or as a path variable in the job details page `https://www.linkedin.com/jobs/view/{jobId}`
  - If a job has an entry in the cache then display the analysis result immediately.
  - After performing analysis, store the result in the cache. If the entry exists then overwrite it. The cache is capped at 256 entries. Cache eviction is based on FIFO.

### Analysis Result in the List View

- This applies only to the jobs search page.
- Job card is identified by the css class `job-card-container`. It also has a `data-job-id` that contain the job ID.
- For each job card, get its job ID and if it has an entry in the analysis cache then:
  - Look for `ul` that has class `job-card-list__footer-wrapper` within the card
  - Append to it an `li` item containing the analysis result

### Auto Analysis

- If the auto analysis is enabled then this feature will be enabled on both jobs search and job details pages.
- If the current job is not cached and auto analysis is enabled, then trigger the job analysis automatically
- The Analyze Job button should indicate the analysis is in progress just like manual analysis
- All the other related side effects in the manual analysis will apply to the auto analysis such as caching

### UI/UX

- BLJ will use style similar to LinkedIn for both the settings popup, analysis button and the analysis result.
- BLJ will follow best practicies in UI/UX to create modern design, it will utlize css without any external dependecy.
- In the jobs search page, when a user switches between jobs. The analysis result must be reset.
