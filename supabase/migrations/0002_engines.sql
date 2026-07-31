alter table models add column image_engine text not null default 'gpt-image-2';
alter table video_batches add column image_engine text not null default 'gpt-image-2';
alter table video_batches add column video_engine text not null default 'seedance-2-mini-image-to-video';
