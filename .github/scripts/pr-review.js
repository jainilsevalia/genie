const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

function createAnnotation(core, type, message, file = null, line = null) {
  const annotation = {
    title: 'PR Review Bot',
    message: message
  };
  
  if (file) {
    annotation.file = file;
    if (line) {
      annotation.line = line;
    }
  }
  
  switch(type) {
    case 'error':
      core.error(message, annotation);
      break;
    case 'warning':
      core.warning(message, annotation);
      break;
    case 'notice':
      core.notice(message, annotation);
      break;
    default:
      console.log(message);
  }
}

async function callOllama(prompt, filename) {
  console.log(`::group::Ollama Request for ${filename}`);
  try {
    await execPromise('ollama list');
    
    const { stdout, stderr } = await execPromise(
      `ollama run deepseek-coder:33b "${prompt.replace(/"/g, '\\"')}"`,
      { timeout: 300000 }
    );
    
    if (stderr) {
      console.error('Ollama stderr:', stderr);
    }
    
    console.log('::endgroup::');
    return stdout.trim();
  } catch (error) {
    console.log('::endgroup::');
    throw new Error(`Ollama request failed: ${error.message}`);
  }
}

async function reviewPR({ github, context, core }) {
  const start_time = Date.now();
  createAnnotation(core, 'notice', 'Starting PR review process');
  
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
    console.log(`\n::group::Processing ${file.filename}`);
    try {
      if (file.status === 'removed' || 
          file.filename.endsWith('.pdf') || 
          file.filename.endsWith('.docx') || 
          file.filename.endsWith('.prof')) {
        skippedFiles++;
        console.log('::endgroup::');
        continue;
      }
      
      try {
        const { data: fileContent } = await github.rest.repos.getContent({
          ...context.repo,
          path: file.filename,
          ref: pullRequest.head.sha
        });
        
        const content = Buffer.from(fileContent.content, 'base64').toString();
        
        // Simplified prompt for shorter reviews
        const prompt = `Review this code change and provide 1-2 key suggestions or concerns, focusing only on the most important issues:

        File: ${file.filename}
        Changes:
        ${file.patch || 'New file'}`;
        
        const review = await callOllama(prompt, file.filename);
        
        if (!review) {
          throw new Error('Empty review received from Ollama');
        }
        
        await github.rest.pulls.createReviewComment({
          ...context.repo,
          pull_number: context.payload.pull_request.number,
          body: review,
          commit_id: pullRequest.head.sha,
          path: file.filename,
          line: file.patch ? file.patch.split('\n').length : 1
        });
        
        processedFiles++;
        createAnnotation(core, 'notice', `Reviewed ${file.filename}`, file.filename);
      } catch (error) {
        if (error.status === 404) {
          skippedFiles++;
          console.log('::endgroup::');
          continue;
        }
        throw error;
      }
    } catch (error) {
      console.error(`Error details:`, error);
      createAnnotation(core, 'error', `Failed to review file: ${error.message}`, file.filename);
      errorFiles++;
    }
    console.log('::endgroup::');
  }
  
  const duration = ((Date.now() - start_time) / 1000).toFixed(2);
  createAnnotation(core, 'notice', `PR Review completed: ${processedFiles} processed, ${skippedFiles} skipped, ${errorFiles} errors`);
}

module.exports = { reviewPR };