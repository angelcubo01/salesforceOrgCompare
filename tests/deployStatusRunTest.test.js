import { describe, expect, it } from 'vitest';
import {
  collectSlowTests,
  DEPLOY_SLOW_TEST_THRESHOLD_MS,
  enrichActiveRowFromSoap,
  hasCoverageFailureInRow,
  hasCoverageFailureInSoap,
  isDeployActivelyRunning,
  isDeployInProgress,
  isSoapActivelyRunning,
  normalizeDeployRow,
  resolveActiveAndPendingDeploys,
  areDeployComponentsComplete,
  isDeployInTestExecutionPhase,
  resolveDeployProgressDetail,
  resolveDeployRunningTest
} from '../shared/deployStatusApi.js';

describe('deployStatus run test helpers', () => {
  it('collectSlowTests incluye éxitos y fallos por encima del umbral', () => {
    const slow = collectSlowTests({
      failures: [{ className: 'FailCls', methodName: 'slowFail', time: '12000' }],
      successes: [
        { className: 'FastCls', methodName: 'quick', time: '200' },
        { className: 'SlowCls', methodName: 'slowOk', time: '15000' }
      ]
    });
    expect(slow).toHaveLength(2);
    expect(slow[0]).toEqual({ className: 'SlowCls', methodName: 'slowOk', timeMs: 15000 });
    expect(slow[1]).toEqual({ className: 'FailCls', methodName: 'slowFail', timeMs: 12000 });
  });

  it('collectSlowTests ignora tests por debajo del umbral de Setup', () => {
    const slow = collectSlowTests({
      successes: [{ className: 'Cls', methodName: 'm', time: String(DEPLOY_SLOW_TEST_THRESHOLD_MS - 1) }]
    });
    expect(slow).toHaveLength(0);
  });

  it('hasCoverageFailureInRow detecta ErrorMessage de cobertura en DeployRequest', () => {
    expect(
      hasCoverageFailureInRow({
        status: 'Failed',
        errorMessage: 'Average test coverage across all Apex Classes and Triggers is 71%, at least 75% test coverage is required.'
      })
    ).toBe(true);
    expect(hasCoverageFailureInRow({ status: 'Failed', errorMessage: 'Un problema genérico' })).toBe(false);
    expect(hasCoverageFailureInRow({ status: 'Succeeded', errorMessage: 'coverage' })).toBe(false);
  });

  it('hasCoverageFailureInSoap detecta codeCoverageWarnings', () => {
    expect(
      hasCoverageFailureInSoap({
        runTestResult: {
          codeCoverageWarnings: [{ name: 'MyClass', message: 'Test coverage is 0%' }]
        }
      })
    ).toBe(true);
    expect(hasCoverageFailureInSoap({ errorMessage: 'Code coverage failure' })).toBe(true);
    expect(hasCoverageFailureInSoap({ errorMessage: 'Other error' })).toBe(false);
  });

  it('isDeployInProgress distingue cola Pending de ejecución InProgress', () => {
    expect(isDeployInProgress('InProgress')).toBe(true);
    expect(isDeployInProgress('Pending')).toBe(true);
    expect(isDeployInProgress('Succeeded')).toBe(false);
  });

  it('resolveDeployRunningTest extrae el test del stateDetail SOAP en fase de tests', () => {
    const row = { status: 'InProgress', testsTotal: 5, testsCompleted: 1 };
    const soap = {
      done: false,
      numberComponentsTotal: 8,
      numberComponentsDeployed: 8,
      numberTestsTotal: 5,
      numberTestsCompleted: 1,
      stateDetail: 'Running Test: AV_GptSchPreparacionEntrevista_Test.myUnitTest'
    };
    expect(resolveDeployRunningTest(soap, row)).toBe('AV_GptSchPreparacionEntrevista_Test.myUnitTest');
    expect(resolveDeployProgressDetail(row, soap)).toEqual({
      showRunningTestLabel: true,
      text: 'AV_GptSchPreparacionEntrevista_Test.myUnitTest'
    });
    expect(resolveDeployRunningTest({ done: true, stateDetail: 'Running Test: X.y' }, row)).toBe('');
    expect(resolveDeployRunningTest({ done: false, stateDetail: '' }, row)).toBe('');
  });

  it('resolveDeployProgressDetail muestra stateDetail sin etiqueta durante componentes', () => {
    const row = {
      status: 'InProgress',
      componentsTotal: 12,
      componentsDeployed: 6,
      testsTotal: 20
    };
    const soap = {
      done: false,
      numberComponentsTotal: 12,
      numberComponentsDeployed: 6,
      numberTestsTotal: 20,
      numberTestsCompleted: 0,
      stateDetail: 'Deploying Apex Class: MyClass'
    };
    expect(areDeployComponentsComplete(row, soap)).toBe(false);
    expect(isDeployInTestExecutionPhase(row, soap)).toBe(false);
    expect(resolveDeployProgressDetail(row, soap)).toEqual({
      showRunningTestLabel: false,
      text: 'Deploying Apex Class: MyClass'
    });
    expect(resolveDeployRunningTest(soap, row)).toBe('');
  });

  it('resolveDeployProgressDetail usa etiqueta running test solo con componentes completos', () => {
    const row = {
      status: 'InProgress',
      componentsTotal: 8,
      componentsDeployed: 8,
      testsTotal: 5,
      testsCompleted: 2
    };
    const soap = {
      done: false,
      numberComponentsTotal: 8,
      numberComponentsDeployed: 8,
      numberTestsTotal: 5,
      numberTestsCompleted: 2,
      stateDetail: 'Running Test: Foo_Test.bar'
    };
    expect(areDeployComponentsComplete(row, soap)).toBe(true);
    expect(isDeployInTestExecutionPhase(row, soap)).toBe(true);
    expect(resolveDeployProgressDetail(row, soap).showRunningTestLabel).toBe(true);
  });

  it('normalizeDeployRow expone CreatedDate para la cola FIFO', () => {
    const row = normalizeDeployRow({
      Id: '0AfXX',
      Status: 'Pending',
      CheckOnly: true,
      Type: 'Api',
      CreatedDate: '2026-07-06T08:57:26.000+0000',
      CreatedBy: { Name: 'Admin' }
    });
    expect(row.asyncId).toBe('0AfXX');
    expect(row.status).toBe('Pending');
    expect(row.createdDate).toBe('2026-07-06T08:57:26.000+0000');
    expect(row.createdByName).toBe('Admin');
  });

  it('isSoapActivelyRunning detecta progreso real aunque DeployRequest siga Pending', () => {
    expect(isSoapActivelyRunning({ done: false, numberComponentsTotal: 8, numberComponentsDeployed: 8 })).toBe(
      true
    );
    expect(isSoapActivelyRunning({ done: false, numberComponentsTotal: 0, numberComponentsDeployed: 0 })).toBe(
      false
    );
  });

  it('resolveActiveAndPendingDeploys separa validate en curso y deploy encolado', () => {
    const deployQueued = {
      row: { asyncId: '0AfDEPLOY', status: 'Pending', checkOnly: false },
      soap: { done: false, numberComponentsTotal: 0, numberComponentsDeployed: 0 }
    };
    const validateRunning = {
      row: { asyncId: '0AfVALID', status: 'Pending', checkOnly: true },
      soap: { done: false, numberComponentsTotal: 8, numberComponentsDeployed: 8, numberTestsTotal: 5, numberTestsCompleted: 4 }
    };

    const { active, pending } = resolveActiveAndPendingDeploys([deployQueued, validateRunning]);
    expect(active?.row?.asyncId).toBe('0AfVALID');
    expect(pending.map((p) => p.row.asyncId)).toEqual(['0AfDEPLOY']);
  });

  it('resolveActiveAndPendingDeploys no duplica el activo en la cola', () => {
    const stuckInProgress = {
      row: { asyncId: '0AfSTUCK', status: 'InProgress', checkOnly: false },
      soap: { done: false, numberComponentsTotal: 0, numberComponentsDeployed: 0 }
    };
    const validateRunning = {
      row: { asyncId: '0AfVALID', status: 'Pending', checkOnly: true },
      soap: { done: false, numberComponentsTotal: 5, numberComponentsDeployed: 5 }
    };

    const { active, pending } = resolveActiveAndPendingDeploys([stuckInProgress, validateRunning]);
    expect(active?.row?.asyncId).toBe('0AfVALID');
    expect(pending.map((p) => p.row.asyncId)).toEqual(['0AfSTUCK']);
  });

  it('resolveActiveAndPendingDeploys mantiene Pending sin SOAP en cola aunque sea el único', () => {
    const onlyPending = {
      row: { asyncId: '0AfONLY', status: 'Pending', checkOnly: false },
      soap: { done: false, numberComponentsTotal: 0, numberComponentsDeployed: 0 }
    };

    const { active, pending } = resolveActiveAndPendingDeploys([onlyPending]);
    expect(active).toBeNull();
    expect(pending.map((p) => p.row.asyncId)).toEqual(['0AfONLY']);
    expect(isDeployActivelyRunning(onlyPending.row, onlyPending.soap)).toBe(false);
  });

  it('resolveActiveAndPendingDeploys no promueve Pending sin SOAP aunque haya varios en cola', () => {
    const first = {
      row: { asyncId: '0AfFIRST', status: 'Pending', checkOnly: false, createdDate: '2026-07-06T08:00:00.000Z' },
      soap: { done: false, numberComponentsTotal: 0, numberComponentsDeployed: 0 }
    };
    const second = {
      row: { asyncId: '0AfSECOND', status: 'Pending', checkOnly: false, createdDate: '2026-07-06T08:05:00.000Z' },
      soap: { done: false, numberComponentsTotal: 0, numberComponentsDeployed: 0 }
    };

    const { active, pending } = resolveActiveAndPendingDeploys([first, second]);
    expect(active).toBeNull();
    expect(pending.map((p) => p.row.asyncId)).toEqual(['0AfFIRST', '0AfSECOND']);
  });

  it('resolveActiveAndPendingDeploys prioriza InProgress con progreso SOAP sobre cola Pending', () => {
    const running = {
      row: { asyncId: '0AfRUN', status: 'InProgress', checkOnly: false },
      soap: {
        done: false,
        status: 'InProgress',
        startDate: '2026-07-06T09:00:00.000Z',
        numberComponentsTotal: 12,
        numberComponentsDeployed: 6,
        numberTestsTotal: 20,
        numberTestsCompleted: 0
      }
    };
    const queued = {
      row: { asyncId: '0AfQUEUE', status: 'Pending', checkOnly: false },
      soap: { done: false, numberComponentsTotal: 0, numberComponentsDeployed: 0 }
    };

    const { active, pending } = resolveActiveAndPendingDeploys([running, queued]);
    expect(active?.row?.asyncId).toBe('0AfRUN');
    expect(pending.map((p) => p.row.asyncId)).toEqual(['0AfQUEUE']);
  });

  it('enrichActiveRowFromSoap copia progreso y fecha de inicio del SOAP', () => {
    const row = { asyncId: '0AfRUN', status: 'Pending', componentsTotal: 0, componentsDeployed: 0 };
    const soap = {
      done: false,
      status: 'InProgress',
      startDate: '2026-07-06T09:00:00.000Z',
      numberComponentsTotal: 10,
      numberComponentsDeployed: 4,
      numberTestsTotal: 5,
      numberTestsCompleted: 2
    };
    const enriched = enrichActiveRowFromSoap(row, soap);
    expect(enriched.status).toBe('InProgress');
    expect(enriched.startDate).toBe('2026-07-06T09:00:00.000Z');
    expect(enriched.componentsTotal).toBe(10);
    expect(enriched.componentsDeployed).toBe(4);
    expect(enriched.testsTotal).toBe(5);
    expect(enriched.testsCompleted).toBe(2);
  });
});
