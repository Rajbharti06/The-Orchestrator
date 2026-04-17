const { generateCode } = require('./orchestrator');
const { backendAgent } = require('./agents/backendAgent');
const { uiAgent } = require('./agents/uiAgent');
const { plannerAgent } = require('./agents/plannerAgent');
const { qaAgent } = require('./agents/qaAgent');
const { fixAgent } = require('./agents/fixAgent');
const fs = require('fs-extra');
const path = require('path');

jest.mock('./agents/backendAgent');
jest.mock('./agents/uiAgent');
jest.mock('./agents/plannerAgent');
jest.mock('./agents/qaAgent');
jest.mock('./agents/fixAgent');
jest.mock('fs-extra');

describe('Orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('should call planner, agents, and run QA audit', async () => {
    const mockPlan = {
      tasks: [{ type: "backend", description: "test" }]
    };
    const mockBackendResponse = { files: [{ path: 'src/backend.js', content: '' }] };
    const mockQaResult = { hasIssues: false, issues: [] };

    plannerAgent.mockResolvedValue(mockPlan);
    backendAgent.mockResolvedValue(mockBackendResponse);
    qaAgent.mockResolvedValue(mockQaResult);

    await generateCode('test');

    expect(plannerAgent).toHaveBeenCalled();
    expect(backendAgent).toHaveBeenCalled();
    expect(qaAgent).toHaveBeenCalled();
    expect(fixAgent).not.toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should run FixAgent if QA finds issues', async () => {
    const mockPlan = { tasks: [{ type: "backend", description: "test" }] };
    const mockBackendResponse = { files: [{ path: 'src/backend.js', content: 'bug' }] };
    const mockQaResult = { hasIssues: true, issues: [{ description: 'bug found', severity: 'high' }] };
    const mockFixedFiles = [{ path: 'src/backend.js', content: 'fixed' }];

    plannerAgent.mockResolvedValue(mockPlan);
    backendAgent.mockResolvedValue(mockBackendResponse);
    qaAgent.mockResolvedValue(mockQaResult);
    fixAgent.mockResolvedValue(mockFixedFiles);

    await generateCode('test');

    expect(qaAgent).toHaveBeenCalled();
    expect(fixAgent).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('backend.js'), 'fixed');
  });
});
