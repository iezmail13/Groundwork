-- Communication notifications (D106). New enum values go in their own
-- migration so they're committed before anything uses them.
alter type public.notification_type add value if not exists 'direct_message';
alter type public.notification_type add value if not exists 'channel_message';
alter type public.notification_type add value if not exists 'mention';
alter type public.notification_type add value if not exists 'task_comment';
alter type public.notification_type add value if not exists 'task_changed';
alter type public.notification_type add value if not exists 'discussion';
