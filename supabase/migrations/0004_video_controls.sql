alter table video_batches drop constraint if exists video_batches_duration_seconds_check;
alter table video_batches add constraint video_batches_duration_seconds_check
  check (duration_seconds between 4 and 15);

alter table video_batches add column if not exists generate_audio boolean not null default true;
alter table video_batches add column if not exists high_bitrate boolean not null default false;
alter table video_batches add column if not exists aspect_ratio text not null default '9:16';
alter table video_batches add column if not exists resolution text not null default '720p';
