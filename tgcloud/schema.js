import { table, integer, text, index } from 'sdk/db';

// Часовой пояс пользователя (chat_id = id чата, в личке совпадает с id пользователя)
export const users = table('users', {
  chatId:    integer('chat_id').primaryKey(),
  tz:        text('tz').notNull(),
  createdAt: integer('created_at').notNull(),   // unix ms
});

export const reminders = table('reminders', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  chatId:     integer('chat_id').notNull(),
  text:       text('text').notNull(),
  nextAt:     integer('next_at').notNull(),     // следующее срабатывание, UTC unix ms
  repeatRule: text('repeat_rule'),              // JSON правила повтора или NULL (разовое)
  tz:         text('tz').notNull(),
  active:     integer('active').notNull().default(1),
  createdAt:  integer('created_at').notNull(),  // unix ms
}, (t) => ({
  dueIdx:  index('idx_reminders_due').on(t.active, t.nextAt),
  chatIdx: index('idx_reminders_chat').on(t.chatId, t.active),
}));
