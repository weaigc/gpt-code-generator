#!/usr/bin/env node

import path from 'node:path';
import { GradioChatBot } from 'gradio-chatbot';
import fs from 'fs-extra';
import Debug from 'debug';
import { Spinner } from '../utils/spinner';
import { RL } from '../utils/rl';

const debug = Debug('ai-generator');
const root = process.cwd();

const excludeFiles = ['.git', 'node_modules'].map(dir => `${dir}/`).concat(['package-lock.json', 'yarn.lock']);
const specialChars = {
  '，': ',',
  '。': '.',
  '…': '...',
  '‘': '\'',
  '’': '\'',
  '“': '"',
  '”': '"',
};

const terminalRoot = '/app';
const systemPrompt = `我想让你充当 Linux 终端。我将输入命令，您将回复终端应显示的内容。我希望您只在一个唯一的代码块内回复终端输出，而不是其他任何内容。不要写解释。除非我指示您这样做，否则不要键入命令。当我需要用英语告诉你一些事情时，我会把文字放在中括号内[就像这样]。`;
const files = [];

const spinner = new Spinner();

const resolvePath = (filePath: string) => {
  filePath = path.join('/', filePath).split(path.sep).join('/').trim();
  return filePath.trim().startsWith(terminalRoot) ? filePath : `/app${filePath}`;
}

async function doAction(filePath: string, bot: GradioChatBot, prompt?: string) {
  const action = filePath.endsWith('/') ? 'ls' : 'write';
  if (!prompt) {
    prompt = action === 'ls' ? `[ls -aF ${filePath}]` : `[cat ${filePath}]`;
  }
  debug(`command:`, prompt);

  let response = await bot.chat(prompt);
  response = response.replace(/[…，。‘’“”]/g, (match) => {
    return specialChars[match] || match;
  });

  if (action === 'ls') {
    debug(`list director "${filePath}":`, response.trim().split(/\s+/).join(' '));
    if (response.indexOf('No such file or directory') !== -1) return;
    for (let file of response.split(/\s+/)) {
      file = file.replace(/\\/g, '');
      if (/^\[([^\]]+)\]/.test(file)) {
        file = RegExp.$1;
      }
      if (excludeFiles.includes(file) || !/^[a-z0-9]/i.test(file)) continue;
      debug('write:', path.relative(terminalRoot, file));
      file = resolvePath(path.join(filePath, file));
      files.push(file);
      if (file.endsWith('/')) {
        spinner.write(`mkdir: ${path.relative(terminalRoot, file)}\n`);
        await fs.ensureDir(path.join(root, file)).catch(e => e);
      }
    }
  } else {
    spinner.write(`write: ${filePath}\n`);
    await fs.outputFile(path.join(root, filePath), response).catch(e => e);
  }
}

export async function cli(initPrompt: string) {
  const bot = new GradioChatBot({
    url: '0',
    historySize: 100,
  });

  await fs.ensureDir(path.join(root, 'app'));
  await fs.emptyDir(path.join(root, 'app'));

  if (!initPrompt.trim()) {
    const rl = new RL();
    initPrompt = await rl.question('Please write you demand: ');
    rl.close();
  }
  if (!initPrompt.trim()) return;

  spinner.write('GPT generator is writing code...\n');
  spinner.start();
  do {
    if (!files.length) {
      initPrompt = `${systemPrompt}，我的需求是：${initPrompt}. 你当前的默认工作目录是 ${terminalRoot}, 里面包含了需求中提到的代码。我的第一个命令是 [ls -aF]`;
      await doAction(terminalRoot, bot, initPrompt);
    } else {
      const file = files.shift();
      await doAction(file, bot);
    }
  } while (files.length);
  while (true) {
    spinner.stop();
    const rl = new RL();
    const question = await rl.question('Please enter your feedback or suggestions here, otherwise press enter to exit: ');
    rl.close();
    if (!question.trim()) break;
    spinner.start();
    const prompt = question.startsWith('[') ? question : `请根据我的要求对项目文件进行改动并保存，同时使用git记录本次改动文件，未改动的文件不需要记录，我的要求是：${question}`;
    debug('prompt:', prompt);
    let response = await bot.chat(prompt);
    response = response.replace(/[…，。‘’“”]/g, (match) => {
      return specialChars[match] || match;
    });
    spinner.write(`${response}\n`);
    const modifyContent = await bot.chat(`[git status -z]`);
    debug('git status', modifyContent);
    for (let row of modifyContent.split('\n')) {
      const [action, file] = row.trim().split(/\s+/);
      if (/[A|M]/.test(action) && !file.endsWith('/')) {
        await doAction(resolvePath(file), bot);
      }
    }
  }
  spinner.write('\nAll Done!');
  spinner.stop();
}

cli(process.argv.slice(2).join(' ') || '');
