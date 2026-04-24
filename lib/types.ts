export type StepRect = { x: number; y: number; w: number; h: number };

export type ElementInfo = {
  tag: string;
  text: string;
  role?: string;
  ariaLabel?: string;
  name?: string;
  placeholder?: string;
  href?: string;
  selector?: string;
  ancestorTag?: string;
};

export type Step = {
  id: string;
  sessionId: string;
  order: number;
  url: string;
  pageTitle: string;
  caption: string;
  note?: string;
  image: Blob;
  rect: StepRect;
  dpr: number;
  element?: ElementInfo;
  createdAt: number;
};

export type NavEvent = {
  id: string;
  sessionId: string;
  url: string;
  pageTitle?: string;
  kind: 'initial' | 'commit' | 'spa';
  tabId?: number;
  timestamp: number;
};

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type ClickMessage = {
  type: 'sierra:click';
  sessionId: string;
  rect: StepRect;
  url: string;
  pageTitle: string;
  element: ElementInfo;
  dpr: number;
  viewport: { w: number; h: number };
};

export type StartMessage = { type: 'sierra:start'; title: string };
export type StopMessage = { type: 'sierra:stop' };
export type StateMessage = { type: 'sierra:state' };
export type StateResponse = { recording: boolean; sessionId: string | null };

export type NavMessage = {
  type: 'sierra:nav';
  sessionId: string;
  url: string;
  pageTitle?: string;
  kind: NavEvent['kind'];
  tabId?: number;
};
