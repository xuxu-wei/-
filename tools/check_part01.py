"""第 1 篇检查入口；共用正式教材检查规则。"""
import sys
from check_teaching import main
if __name__=='__main__':
    sys.argv[1:]=['--part','1','--work','m3-part01',*sys.argv[1:]]
    main()
