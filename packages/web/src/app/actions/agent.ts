/**
 * エージェント制御のServer Actions
 */

'use server';

import { agentStore } from '@/lib/agent-store';

/**
 * エージェントを開始
 */
export async function startAgent() {
  try {
    const commandId = agentStore.addCommand('start');
    return {
      success: true,
      commandId,
    };
  } catch (error) {
    console.error('Failed to start agent:', error);
    return {
      success: false,
      error: 'Failed to start agent',
    };
  }
}

/**
 * エージェントを停止
 */
export async function stopAgent() {
  try {
    const commandId = agentStore.addCommand('stop');
    return {
      success: true,
      commandId,
    };
  } catch (error) {
    console.error('Failed to stop agent:', error);
    return {
      success: false,
      error: 'Failed to stop agent',
    };
  }
}

/**
 * エージェントを一時停止
 */
export async function pauseAgent() {
  try {
    const commandId = agentStore.addCommand('pause');
    return {
      success: true,
      commandId,
    };
  } catch (error) {
    console.error('Failed to pause agent:', error);
    return {
      success: false,
      error: 'Failed to pause agent',
    };
  }
}

/**
 * エージェントを再開
 */
export async function resumeAgent() {
  try {
    const commandId = agentStore.addCommand('resume');
    return {
      success: true,
      commandId,
    };
  } catch (error) {
    console.error('Failed to resume agent:', error);
    return {
      success: false,
      error: 'Failed to resume agent',
    };
  }
}

/**
 * エージェントをリロード
 */
export async function reloadAgent() {
  try {
    const commandId = agentStore.addCommand('reload');
    return {
      success: true,
      commandId,
    };
  } catch (error) {
    console.error('Failed to reload agent:', error);
    return {
      success: false,
      error: 'Failed to reload agent',
    };
  }
}
