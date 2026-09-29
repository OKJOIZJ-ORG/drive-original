/* Q3 QA bridge, SPDX-License-Identifier: MIT. FFmpeg remains LGPL-2.1-or-later. */
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include "libavcodec/avcodec.h"
#include "libavutil/imgutils.h"
typedef struct { AVCodecContext *c; AVPacket *p; AVFrame *f; } Q3;
EMSCRIPTEN_KEEPALIVE Q3 *q3_open(uint8_t *extra,int length){
 Q3 *q=calloc(1,sizeof(Q3));if(!q)return NULL;
 q->c=avcodec_alloc_context3(avcodec_find_decoder(AV_CODEC_ID_MPEG4));q->p=av_packet_alloc();q->f=av_frame_alloc();
 if(!q->c||!q->p||!q->f)goto fail;
 q->c->max_pixels=1920*1080;q->c->thread_count=1;
 if(length){q->c->extradata=av_mallocz(length+AV_INPUT_BUFFER_PADDING_SIZE);if(!q->c->extradata)goto fail;memcpy(q->c->extradata,extra,length);q->c->extradata_size=length;}
 if(avcodec_open2(q->c,avcodec_find_decoder(AV_CODEC_ID_MPEG4),NULL)<0)goto fail;
 return q;
 fail:avcodec_free_context(&q->c);av_packet_free(&q->p);av_frame_free(&q->f);free(q);return NULL;
}
EMSCRIPTEN_KEEPALIVE int q3_send(Q3*q,uint8_t*data,int n,int timestamp){
 if(n<1||n>1048576)return -1;
 if(av_new_packet(q->p,n)<0)return -2;memcpy(q->p->data,data,n);q->p->pts=timestamp;
 int r=avcodec_send_packet(q->c,q->p);av_packet_unref(q->p);return r;
}
EMSCRIPTEN_KEEPALIVE int q3_receive(Q3*q){return avcodec_receive_frame(q->c,q->f);}
EMSCRIPTEN_KEEPALIVE int q3_width(Q3*q){return q->f->width;}
EMSCRIPTEN_KEEPALIVE int q3_height(Q3*q){return q->f->height;}
EMSCRIPTEN_KEEPALIVE int q3_format(Q3*q){return q->f->format;}
EMSCRIPTEN_KEEPALIVE int q3_copy(Q3*q,uint8_t*out,int capacity){return av_image_copy_to_buffer(out,capacity,(const uint8_t * const*)q->f->data,q->f->linesize,q->f->format,q->f->width,q->f->height,1);}
EMSCRIPTEN_KEEPALIVE void q3_close(Q3*q){if(!q)return;avcodec_free_context(&q->c);av_packet_free(&q->p);av_frame_free(&q->f);free(q);}
