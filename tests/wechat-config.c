/* Tests use only synthetic buffers and this process's memory, never WeChat. */
#define DSH_CONFIG_TEST
#include "../plugins/dsh-wechat-digest/native/config_scan.c"
#include <assert.h>
static void put64(unsigned char *p,uint64_t v){memcpy(p,&v,8);}
int main(void){
 assert(valid_name("contact/contact.db"));assert(valid_name("message/message_31.db"));assert(!valid_name("message/message_32.db"));assert(!valid_name("../contact.db"));
 unsigned char raw[164]={0};raw[0]='x';raw[1]='\'';for(int i=0;i<160;i++)raw[i+2]=(unsigned char)(i<64?'a':i<128?'b':'c');raw[162]='\'';
 struct target target={0};strcpy(target.name,"contact/contact.db");memset(target.salt,'c',32);
 assert(scan_buffer(raw,163,&target,1)==1);assert(strlen(target.key)==64&&strlen(target.hmac)==64);
 wipe(&target.key,sizeof(target.key));wipe(&target.hmac,sizeof(target.hmac));target.salt[0]='d';assert(scan_buffer(raw,163,&target,1)==0);target.salt[0]='c';
 for(int slot=0;slot<3;slot++){
  unsigned char config[0xd0]={0},node[0x50]={0},blob[163];for(int i=0;i<163;i++)blob[i]=raw[i]^CONFIG_MASK[i%32];
  uint64_t offsets[]={0x68,0x90,0x88};put64(config+offsets[slot]+8,(uint64_t)blob);put64(config+offsets[slot]+16,sizeof(blob));put64(node+0x10,(uint64_t)CONFIG_NAME);put64(node+0x18,sizeof(CONFIG_NAME)-1);put64(node+0x28,(uint64_t)config);
  struct capture capture={0};capture.task=mach_task_self();capture.targets=&target;capture.target_count=1;capture.deadline=now()+1;
  config_reference(&capture,(uint64_t)node+0x10,(uint64_t)CONFIG_NAME);assert(capture.found==1);assert(strlen(target.hmac)==64);wipe(target.key,sizeof(target.key));wipe(target.hmac,sizeof(target.hmac));
 }
 raw[98]='\'';strcpy(target.salt,"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");assert(scan_buffer(raw,99,&target,1)==1);assert(!target.hmac[0]);
 puts("Synthetic key/config matching: 96/160 hex, all offsets, salt isolation passed; no WeChat access.");return 0;
}
