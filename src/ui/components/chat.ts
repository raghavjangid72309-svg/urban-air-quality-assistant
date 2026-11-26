import type { AssistantReply } from '../../assistant/respond';
import { el } from '../dom';

export type Speaker = 'user' | 'assistant';

/** One message in the conversation log. The speaker is announced to screen readers. */
export function chatMessage(speaker: Speaker, message: string | AssistantReply): HTMLElement {
  const text = typeof message === 'string' ? message : message.text;
  const points = typeof message === 'string' ? [] : message.points;

  return el('div', { class: `message message-${speaker}` }, [
    el('p', { class: 'visually-hidden' }, [speaker === 'user' ? 'You asked:' : 'AirWise:']),
    el('p', {}, [text]),
    points.length > 0 && el('ul', {}, points.map((point) => el('li', {}, [point]))),
  ]);
}

export function suggestionButtons(questions: readonly string[]): HTMLButtonElement[] {
  return questions.map((question) => el('button', { type: 'button', class: 'chip', 'data-question': question }, [question]));
}
