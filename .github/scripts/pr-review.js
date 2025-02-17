const { Anthropic } = require('@anthropic-ai/sdk');

function createAnnotation(core, type, message, file = null, line = null) {
  const annotation = { title: 'PR Review Bot', message };
  if (file) {
    annotation.file = file;
    if (line) annotation.line = line;
  }
  
  switch(type) {
    case 'error': core.error(message, annotation); break;
    case 'warning': core.warning(message, annotation); break;
    case 'notice': core.notice(message, annotation); break;
    default: console.log(message);
  }
}

async function getReview(anthropic, content, filename) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Review this code change and provide 1-2 key suggestions or concerns, focusing only on the most important issues. Be brief and specific:

        File: ${filename}
        Changes:
        ${content}`
      }]
    });
    
    return response.content[0].text;
  } catch (error) {
    throw new Error(`Claude API request failed: ${error.message}`);
  }
}

async function reviewPR({ github, context, core }) {
  const anthropic = new Anthropic();
  const start_time = Date.now();
  
  try {
    const { data: files } = await github.rest.pulls.listFiles({
      ...context.repo,
      pull_number: context.payload.pull_request.number
    });
    
    const { data: pullRequest } = await github.rest.pulls.get({
      ...context.repo,
      pull_number: context.payload.pull_request.number
    });
    
    let processedFiles = 0;
    let skippedFiles = 0;
    let errorFiles = 0;
    
    for (const file of files) {
      if (file.status === 'removed' || 
          file.filename.match(/\.(pdf|docx|prof|png|jpg)$/)) {
        skippedFiles++;
        continue;
      }
      
      try {
        const { data: fileContent } = await github.rest.repos.getContent({
          ...context.repo,
          path: file.filename,
          ref: pullRequest.head.sha
        });
        
        const review = await getReview(
          anthropic,
          file.patch || 'New file',
          file.filename
        );
        
        if (review) {
          await github.rest.pulls.createReviewComment({
            ...context.repo,
            pull_number: context.payload.pull_request.number,
            body: review,
            commit_id: pullRequest.head.sha,
            path: file.filename,
            line: file.patch ? file.patch.split('\n').length : 1
          });
          processedFiles++;
        }
      } catch (error) {
        if (error.status !== 404) {
          errorFiles++;
          createAnnotation(core, 'error', 
            `Failed to review ${file.filename}: ${error.message}`, 
            file.filename
          );
        } else {
          skippedFiles++;
        }
      }
    }
    
    const duration = ((Date.now() - start_time) / 1000).toFixed(2);
    createAnnotation(core, 'notice', 
      `PR Review completed in ${duration}s: ${processedFiles} processed, ${skippedFiles} skipped, ${errorFiles} errors`
    );
    
  } catch (error) {
    createAnnotation(core, 'error', `PR review process failed: ${error.message}`);
    throw error;
  }
}

module.exports = { reviewPR };