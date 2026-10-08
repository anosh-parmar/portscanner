import socket

def port_scanner(ip, ports):
    print(f"Scanning {ip}...")
    for port in ports:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            if s.connect_ex((ip, port)) == 0:
                print(f"Port {port} is open.")

ip = input("Enter IP address: ")
start_port = int(input("Enter start port: "))
end_port = int(input("Enter end port: "))

ports = range(start_port, end_port + 1)

port_scanner(ip, ports)