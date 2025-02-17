const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Helper function to create GitHub annotations
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
  const start_time = Date.now();
  try {
    console.log('Verifying Ollama service...');
    await execPromise('ollama list');
    
    console.log('Sending prompt to Ollama...');
    const { stdout, stderr } = await execPromise(
      `ollama run deepseek-coder:33b "${prompt.replace(/"/g, '\\"')}"`,
      { timeout: 300000 } // 5 minute timeout for each review
    );
    
    const duration = ((Date.now() - start_time) / 1000).toFixed(2);
    
    if (stderr) {
      console.error('Ollama stderr:', stderr);
      createAnnotation('warning', `Ollama generated stderr output for ${filename}: ${stderr}`);
    }
    
    console.log(`Ollama response received in ${duration} seconds`);
    console.log('Response length:', stdout.length);
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
  
  // Get the PR diff
  console.log('Fetching PR files...');
  const { data: files } = await github.rest.pulls.listFiles({
    ...context.repo,
    pull_number: context.payload.pull_request.number
  });
  console.log(`Found ${files.length} files to review`);
  
  // Get PR details
  console.log('Fetching PR details...');
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
      // Skip binary files and non-code files
      if (file.status === 'removed' || 
          file.filename.endsWith('.pdf') || 
          file.filename.endsWith('.docx') || 
          file.filename.endsWith('.prof')) {
        console.log(`Skipping file (binary or removed file)`);
        skippedFiles++;
        console.log('::endgroup::');
        continue;
      }
      
      // Get file content
      try {
        console.log('Fetching file content...');
        const { data: fileContent } = await github.rest.repos.getContent({
          ...context.repo,
          path: file.filename,
          ref: pullRequest.head.sha
        });
        
        const content = Buffer.from(fileContent.content, 'base64').toString();
        console.log(`File content length: ${content.length} characters`);
        
        // Prepare prompt for Deepseek
        const prompt = `You are a highly experienced code reviewer. Please review the following code changes and provide specific, actionable feedback.

        File: ${file.filename}
        Changes:
        ${file.patch || 'New file'}

        Please analyze and provide detailed feedback on:
        1. Potential bugs or logical errors
        2. Security vulnerabilities or concerns
        3. Performance optimizations
        4. Code style and best practices
        5. Documentation completeness
        
        Format your response as clear, constructive feedback with specific line references where applicable. Be concise but thorough.`;
        
        // Generate review using Ollama
        console.log('Generating review...');
        const review = await callOllama(prompt, file.filename);
        
        if (!review) {
          throw new Error('Empty review received from Ollama');
        }
        
        // Post review comment
        console.log('Posting review comment...');
        await github.rest.pulls.createReviewComment({
          ...context.repo,
          pull_number: context.payload.pull_request.number,
          body: review,
          commit_id: pullRequest.head.sha,
          path: file.filename,
          line: file.patch ? file.patch.split('\n').length : 1
        });
        
        processedFiles++;
        createAnnotation(core, 'notice', `Successfully reviewed ${file.filename}`, file.filename);
      } catch (error) {
        if (error.status === 404) {
          console.log(`File not found, skipping`);
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
  const summary = `PR Review completed in ${duration} seconds:
  - Processed: ${processedFiles} files
  - Skipped: ${skippedFiles} files
  - Errors: ${errorFiles} files`;
  
  createAnnotation(core, 'notice', summary);
  console.log('\nDetailed Summary:\n' + summary);
}

module.exports = { reviewPR };