/* Salt-scoped raw-key matcher. MIT: LICENSE-WeChatDBScanner. */
#include <mach/mach.h>
#include <mach/mach_vm.h>
#include <libproc.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/select.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <ctype.h>
#include <pwd.h>
#include <limits.h>
#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <errno.h>
#define DSH_MAX_KEYS 32
#define CHUNK 2097152
#define PASS_LIMIT (8ULL * 1024 * 1024 * 1024)
struct target { char name[80], salt[33], key[65], hmac[65]; };
struct coverage { unsigned long long bytes, regions, failures; int complete, limit; };
static void wipe(void *p,size_t n){volatile unsigned char *v=p;while(n--)*v++=0;}
static double now(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
static int hex(unsigned char c){return (c>='0'&&c<='9')||(c>='a'&&c<='f')||(c>='A'&&c<='F');}
static int valid_name(const char *s){
 if(!strcmp(s,"contact/contact.db"))return 1;
 int n=-1,used=0;char canonical[80];
 if(sscanf(s,"message/message_%d.db%n",&n,&used)!=1||used!=(int)strlen(s)||n<0||n>31)return 0;
 snprintf(canonical,sizeof(canonical),"message/message_%d.db",n);return !strcmp(s,canonical);
}
static void lower_copy(char *out,const unsigned char *in,int length){for(int i=0;i<length;i++)out[i]=(char)tolower(in[i]);out[length]=0;}
static int scan_buffer(const unsigned char *buffer,size_t length,struct target *targets,int count){
 int added=0;
 for(size_t i=0;i+99<=length;i++){
  if((buffer[i]!='x'&&buffer[i]!='X')||buffer[i+1]!='\'')continue;
  int digits=0;
  for(int j=0;j<160&&i+2+(size_t)j<length&&hex(buffer[i+2+j]);j++)digits++;
  if((digits!=96&&digits!=160)||i+2+(size_t)digits>=length||buffer[i+2+digits]!='\'')continue;
  char salt[33];lower_copy(salt,buffer+i+2+digits-32,32);
  for(int t=0;t<count;t++)if(!strcmp(salt,targets[t].salt)){
   if(!targets[t].key[0]){lower_copy(targets[t].key,buffer+i+2,64);added++;}
   if(digits==160&&!targets[t].hmac[0])lower_copy(targets[t].hmac,buffer+i+66,64);
  }
  wipe(salt,sizeof(salt));
 }
 return added;
}
