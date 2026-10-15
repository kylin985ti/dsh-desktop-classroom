/* Experimental read-only Config.Cipher observation.
 * Layout research: sunfeihu007/wechat-cli 8ba897b0cf80dd8bd3545f3c5b32547cbbba55c2
 * and beijinguang/wechat-cli 44c7e9591aded0c44ce0ac4517b8297939bdea16, Apache-2.0.
 * Reuses our scoped MIT keyspec matcher; see both bundled licenses.
 * No target writes, debugger attachment, hooks, re-signing, or process suspension. */
#include "key_match.h"
#include <stdint.h>
#define NAME_LIMIT 256
#define REGION_LIMIT 16384
static const unsigned char CONFIG_NAME[]="com.Tencent.WCDB.Config.Cipher";
static const unsigned char CONFIG_MASK[32]={0xd2,0xc7,0x44,0x24,0x58,0x02,0,0,0,0x48,0x89,0x44,0x24,0x50,0x48,0x8b,0x45,0,0x48,0x84,0x4c,0x24,0x48,0x48,0x89,0x44,0x25,0x40,0x48,0x58,0x4c,0x24};
struct region {uint64_t address,size;int protection,max_protection,tag;};
struct capture {mach_port_t task;struct target *targets;int target_count,found;uint64_t names[NAME_LIMIT],seen[512];int name_count,seen_count,references,blobs,specs;unsigned long long name_bytes,reference_bytes,failures;double deadline;int name_complete,reference_complete,name_limited,reference_limited;};
static uint64_t u64(const unsigned char *p){uint64_t v;memcpy(&v,p,sizeof(v));return v;}
static int pointer(uint64_t p){return p>=0x10000&&p<0x0000800000000000ULL;}
static int exact_read(mach_port_t task,uint64_t p,size_t n,unsigned char *out){if(!pointer(p)||p+n<p)return 0;mach_vm_size_t got=0;return mach_vm_read_overwrite(task,p,n,(mach_vm_address_t)out,&got)==KERN_SUCCESS&&got==n;}
static int known_name(struct capture *c,uint64_t p){for(int i=0;i<c->name_count;i++)if(c->names[i]==p)return 1;return 0;}
static int count_specs(const unsigned char *p,size_t n){int count=0;for(size_t i=0;i+99<=n;i++){if((p[i]!='x'&&p[i]!='X')||p[i+1]!='\'')continue;size_t digits=0;while(digits<161&&i+2+digits<n&&hex(p[i+2+digits]))digits++;if((digits==96||digits==160)&&i+2+digits<n&&p[i+2+digits]=='\'')count++;}return count;}
static void config_reference(struct capture *c,uint64_t pair,uint64_t name){
 if(pair<0x10010||now()>=c->deadline)return;
 unsigned char node[0x50]={0},value[0x28]={0},blob[1024]={0},decoded[1024]={0};
 if(!exact_read(c->task,pair-0x10,sizeof(node),node)||u64(node+0x10)!=name||u64(node+0x18)!=sizeof(CONFIG_NAME)-1)goto done;
 uint64_t config=u64(node+0x28);if(!pointer(config))goto done;
 for(int i=0;i<c->seen_count;i++)if(c->seen[i]==config)goto done;
 if(c->seen_count>=512)goto done;c->seen[c->seen_count++]=config;
 const uint64_t offsets[]={0x68,0x90,0x88};
 for(size_t slot=0;slot<sizeof(offsets)/sizeof(offsets[0]);slot++){
  wipe(value,sizeof(value));wipe(blob,sizeof(blob));wipe(decoded,sizeof(decoded));
  if(!exact_read(c->task,config+offsets[slot],sizeof(value),value))continue;
  uint64_t data=u64(value+8),length=u64(value+16);if(!pointer(data)||!length||length>sizeof(blob))continue;
  if(!exact_read(c->task,data,(size_t)length,blob))continue;c->blobs++;
  c->specs+=count_specs(blob,(size_t)length);c->found+=scan_buffer(blob,(size_t)length,c->targets,c->target_count);
  for(size_t i=0;i<length;i++)decoded[i]=blob[i]^CONFIG_MASK[i%sizeof(CONFIG_MASK)];
  c->specs+=count_specs(decoded,(size_t)length);c->found+=scan_buffer(decoded,(size_t)length,c->targets,c->target_count);
  if(c->found==c->target_count)break;
 }
 done:wipe(node,sizeof(node));wipe(value,sizeof(value));wipe(blob,sizeof(blob));wipe(decoded,sizeof(decoded));
}
static void inspect(struct capture *c,const unsigned char *p,size_t n,uint64_t address,int phase){
 if(phase==0){for(size_t i=0;i+sizeof(CONFIG_NAME)-1<=n;i++)if(p[i]=='c'&&!memcmp(p+i,CONFIG_NAME,sizeof(CONFIG_NAME)-1)){
  uint64_t at=address+i;if(!known_name(c,at)&&c->name_count<NAME_LIMIT)c->names[c->name_count++]=at;
 }}else{
  size_t aligned=(size_t)((8-(address&7))&7);
  for(size_t i=aligned;i+16<=n&&c->found<c->target_count;i+=8)if(u64(p+i+8)==sizeof(CONFIG_NAME)-1&&known_name(c,u64(p+i))){c->references++;config_reference(c,address+i,u64(p+i));}
 }
}
static int read_piece(struct capture *c,uint64_t at,size_t n,unsigned char *tail,size_t *tail_size,int phase){
 vm_offset_t data=0;mach_msg_type_number_t length=0;
 if(mach_vm_read(c->task,at,n,&data,&length)!=KERN_SUCCESS||length!=n){if(data)mach_vm_deallocate(mach_task_self(),data,length);*tail_size=0;return 0;}
 if(phase)c->reference_bytes+=length;else c->name_bytes+=length;
 unsigned char *window=malloc(*tail_size+length);if(!window){wipe((void*)data,length);mach_vm_deallocate(mach_task_self(),data,length);*tail_size=0;return -1;}
 memcpy(window,tail,*tail_size);memcpy(window+*tail_size,(void*)data,length);size_t total=*tail_size+length;
 inspect(c,window,total,at-*tail_size,phase);*tail_size=total<31?total:31;memcpy(tail,window+total-*tail_size,*tail_size);
 wipe(window,total);free(window);wipe((void*)data,length);mach_vm_deallocate(mach_task_self(),data,length);return 1;
}
static int priority(const struct region *r){return r->tag==11||r->tag==7||r->tag==2?0:1;}
static int compare_regions(const void *a,const void *b){const struct region *x=a,*y=b;int d=priority(x)-priority(y);return d?d:(x->address>y->address)-(x->address<y->address);}
static void phase_scan(struct capture *c,struct region *regions,int count,int phase){
 double deadline=phase?c->deadline:now()+35;if(deadline>c->deadline)deadline=c->deadline;
 unsigned long long *bytes=phase?&c->reference_bytes:&c->name_bytes;int ended=1;
 for(int i=0;i<count;i++){
  struct region *r=regions+i;if(!(r->protection&VM_PROT_READ))continue;
  if(phase&&((r->protection&VM_PROT_EXECUTE)||!(r->max_protection&VM_PROT_WRITE)))continue;
  unsigned char tail[31];size_t tail_size=0;
  for(uint64_t off=0;off<r->size;){
   if(now()>=deadline||*bytes>=PASS_LIMIT||c->found==c->target_count){ended=0;break;}
   size_t size=(size_t)(r->size-off);if(size>CHUNK)size=CHUNK;
   int result=read_piece(c,r->address+off,size,tail,&tail_size,phase);
   if(result<0){ended=0;break;}
   if(!result)for(size_t page=0;page<size&&now()<deadline;page+=vm_page_size){size_t length=size-page;if(length>vm_page_size)length=vm_page_size;if(read_piece(c,r->address+off+page,length,tail,&tail_size,phase)<=0)c->failures++;}
   off+=size;usleep(1000);
  }
  wipe(tail,sizeof(tail));if(!ended)break;
 }
 if(phase){c->reference_complete=ended;c->reference_limited=*bytes>=PASS_LIMIT;}else{c->name_complete=ended;c->name_limited=*bytes>=PASS_LIMIT;}
}
/* Only the foreground console user's signed WeChat process is eligible. */
static int wechat_owner(pid_t pid, struct proc_bsdinfo *owner) {
 char path[PROC_PIDPATHINFO_MAXSIZE]={0};struct stat console;
 if(proc_pidpath(pid,path,sizeof(path))<=0||proc_pidinfo(pid,PROC_PIDTBSDINFO,0,owner,sizeof(*owner))!=(int)sizeof(*owner)||!owner->pbi_uid||stat("/dev/console",&console)||console.st_uid!=owner->pbi_uid)return 0;
 const char *suffix="/Contents/MacOS/WeChat";size_t length=strlen(path),tail=strlen(suffix);if(length<=tail||strcmp(path+length-tail,suffix))return 0;
 path[length-tail]=0;CFURLRef url=CFURLCreateFromFileSystemRepresentation(NULL,(const UInt8*)path,(CFIndex)strlen(path),true);if(!url)return 0;
 CFBundleRef bundle=CFBundleCreate(NULL,url);CFRelease(url);if(!bundle)return 0;
 CFStringRef identifier=CFBundleGetIdentifier(bundle);int matches=identifier&&CFEqual(identifier,CFSTR("com.tencent.xinWeChat"));CFRelease(bundle);if(!matches)return 0;
 CFNumberRef number=CFNumberCreate(NULL,kCFNumberIntType,&pid);const void *keys[]={kSecGuestAttributePid},*values[]={number};
 CFDictionaryRef attributes=CFDictionaryCreate(NULL,keys,values,1,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);CFRelease(number);
 SecCodeRef code=NULL;SecRequirementRef requirement=NULL;
 OSStatus status=SecCodeCopyGuestWithAttributes(NULL,attributes,kSecCSDefaultFlags,&code);CFRelease(attributes);
 if(status==errSecSuccess)status=SecRequirementCreateWithString(CFSTR("identifier \"com.tencent.xinWeChat\" and anchor apple generic"),kSecCSDefaultFlags,&requirement);
 if(status==errSecSuccess)status=SecCodeCheckValidity(code,kSecCSDefaultFlags,requirement);
 if(requirement)CFRelease(requirement);if(code)CFRelease(code);return status==errSecSuccess;
}
static int private_file(int fd,uid_t uid,int fifo,off_t limit){struct stat s;return fd>=0&&!fstat(fd,&s)&&s.st_uid==uid&&!(s.st_mode&077)&&(fifo?S_ISFIFO(s.st_mode):S_ISREG(s.st_mode))&&s.st_size<=limit;}
static int emit_keys(int directory,uid_t uid,struct target *targets,int count,size_t *bytes){
 char *payload=NULL;FILE *stream=open_memstream(&payload,bytes);if(!stream)return 0;
 fputc('{',stream);int separator=0;
 for(int i=0;i<count;i++)if(targets[i].key[0]){
  fprintf(stream,"%s\"%s\":{\"key\":\"%s\",\"salt\":\"%s\"",separator++?",":"",targets[i].name,targets[i].key,targets[i].salt);
  if(targets[i].hmac[0])fprintf(stream,",\"hmac\":\"%s\"",targets[i].hmac);fputc('}',stream);
 }
 fputc('}',stream);int ok=!ferror(stream);if(fclose(stream))ok=0;
 int out=openat(directory,"keys.pipe",O_WRONLY|O_NONBLOCK|O_NOFOLLOW);
 if(!ok||*bytes>16384||!private_file(out,uid,1,0)){if(out>=0)close(out);if(payload){wipe(payload,*bytes);free(payload);}return 0;}
 size_t offset=0;double deadline=now()+5;
 while(offset<*bytes&&now()<deadline){ssize_t n=write(out,payload+offset,*bytes-offset);if(n>0)offset+=(size_t)n;else if(errno==EAGAIN||errno==EINTR)usleep(10000);else break;}
 close(out);wipe(payload,*bytes);free(payload);return offset==*bytes;
}
int config_scan_main(int argc,char **argv){
 if(argc!=3||geteuid()!=0)return 2;char *end;long pid=strtol(argv[1],&end,10);if(*end||pid<=0||pid>2147483647)return 2;
 struct proc_bsdinfo owner={0};if(!wechat_owner((pid_t)pid,&owner))return 2;
 int directory=open(argv[2],O_RDONLY|O_DIRECTORY|O_NOFOLLOW);struct stat s;
 if(directory<0||fstat(directory,&s)||!S_ISDIR(s.st_mode)||s.st_uid!=owner.pbi_uid||(s.st_mode&077)){if(directory>=0)close(directory);return 3;}
 int fd=openat(directory,"targets.tsv",O_RDONLY|O_NOFOLLOW);if(!private_file(fd,owner.pbi_uid,0,8192)){if(fd>=0)close(fd);close(directory);return 3;}
 FILE *spec=fdopen(fd,"r");if(!spec){close(fd);close(directory);return 3;}
 struct target targets[DSH_MAX_KEYS]={0};int count=0;char line[256];
 while(fgets(line,sizeof(line),spec)&&count<DSH_MAX_KEYS){char name[80],salt[33],extra;if(sscanf(line,"%79s %32s %c",name,salt,&extra)!=2||!valid_name(name)||strlen(salt)!=32)continue;int ok=1;for(int i=0;i<32;i++)if(!hex(salt[i]))ok=0;for(int i=0;i<count;i++)if(!strcmp(name,targets[i].name))ok=0;if(ok){strcpy(targets[count].name,name);lower_copy(targets[count].salt,(unsigned char*)salt,32);count++;}}
 fclose(spec);if(!count){close(directory);return 3;}
 struct capture c={0};c.targets=targets;c.target_count=count;double started=now();c.deadline=started+90;
 kern_return_t code=task_for_pid(mach_task_self(),(int)pid,&c.task);
 if(code){printf("{\"ok\":false,\"status\":\"denied\",\"machCode\":%d,\"targetMemoryModified\":false}\n",code);close(directory);wipe(targets,sizeof(targets));return 0;}
 struct region *regions=calloc(REGION_LIMIT,sizeof(*regions));if(!regions){mach_port_deallocate(mach_task_self(),c.task);close(directory);wipe(targets,sizeof(targets));return 4;}
 int region_count=0,map_complete=0;uint64_t address=0;natural_t depth=0;
 while(region_count<REGION_LIMIT&&now()<c.deadline){mach_vm_size_t size=0;vm_region_submap_info_data_64_t info;mach_msg_type_number_t n=VM_REGION_SUBMAP_INFO_COUNT_64;code=mach_vm_region_recurse(c.task,&address,&size,&depth,(vm_region_recurse_info_t)&info,&n);if(code==KERN_INVALID_ADDRESS){map_complete=1;break;}if(code||!size||address+size<address)break;if(info.is_submap){depth++;continue;}if(info.protection&VM_PROT_READ)regions[region_count++]=(struct region){address,size,info.protection,info.max_protection,(int)info.user_tag};address+=size;}
 phase_scan(&c,regions,region_count,0);qsort(regions,(size_t)region_count,sizeof(*regions),compare_regions);if(c.name_count)phase_scan(&c,regions,region_count,1);
 wipe(regions,REGION_LIMIT*sizeof(*regions));free(regions);mach_port_deallocate(mach_task_self(),c.task);
 size_t key_bytes=0;int transferred=!c.found||emit_keys(directory,owner.pbi_uid,targets,count,&key_bytes);close(directory);wipe(targets,sizeof(targets));
 if(!transferred){wipe(&c,sizeof(c));return 4;}
 const char *status=c.found?"matched":(!map_complete||!c.name_complete||(c.name_count&&!c.reference_complete)||c.failures?"scan-incomplete":"no-config-key");
 printf("{\"ok\":true,\"status\":\"%s\",\"matchedKeys\":%d,\"requestedDatabases\":%d,\"keyBytes\":%zu,\"elapsedSeconds\":%.1f,\"targetMemoryModified\":false}\n",status,c.found,count,key_bytes,now()-started);wipe(&c,sizeof(c));return 0;
}
#ifndef DSH_CONFIG_TEST
int main(int argc,char **argv){return config_scan_main(argc,argv);}
#endif
